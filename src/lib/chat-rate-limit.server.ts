import type { AdvisorModel } from "@/lib/advisor-models";
import { ADVISOR_MODELS } from "@/lib/advisor-models";

// Best-effort, in-process guard for the anonymous /api/chat endpoint. Cloudflare Workers isolates
// are not guaranteed single-instance or long-lived, so this bucket is a soft first line of
// defense, not a hard cap — it stops casual abuse and cost spikes from a single hot isolate. A
// durable cap (e.g. a Supabase-backed counter keyed by IP/session) is the next step if abuse
// proves this insufficient; keep this module's shape swap-compatible with that.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;
const MAX_MESSAGES = 40;
const MAX_TOTAL_INPUT_CHARS = 20_000;

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

// Bound memory: isolates are short-lived, but guard against pathological growth anyway.
const MAX_TRACKED_KEYS = 5_000;

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - existing.windowStart) };
  }

  existing.count += 1;
  return { allowed: true };
}

/**
 * Durable, cross-isolate rate limit.
 *
 * checkRateLimit above is per-isolate. On Workers that means the effective cap is
 * (limit x live isolates), which is no cap at all -- and the provider chain now puts a FINITE
 * free allowance at the top (10k Workers AI neurons/day), which one abusive client could drain
 * for everybody. This consumes a shared counter instead, incremented atomically in Postgres so
 * two isolates cannot both read "one slot left" and both proceed.
 *
 * Fails OPEN on a database error. A rate limiter that takes the whole chat endpoint down when
 * Postgres hiccups is worse than one that briefly over-admits; the in-process bucket is still
 * checked first, so an outage degrades to the old behaviour rather than to nothing.
 */
export async function checkDurableRateLimit(
  key: string,
): Promise<{ allowed: boolean; retryAfterMs?: number; degraded?: boolean }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Cast: src/integrations/supabase/types.ts is generated from the LIVE schema, so these two
    // RPCs only appear there once 20260906120000_durable_chat_rate_limit.sql is applied and
    // `npm run gen:types` is re-run. Until then the generated union does not include them.
    const rpc = supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data, error } = await rpc("consume_chat_rate_limit", {
      p_bucket_key: key,
      p_window_seconds: Math.floor(WINDOW_MS / 1000),
      p_max_requests: MAX_REQUESTS_PER_WINDOW,
    });
    if (error) return { allowed: true, degraded: true };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { allowed: true, degraded: true };
    const allowed = Boolean((row as { allowed?: boolean }).allowed);
    const retryAfterSeconds = Number((row as { retry_after_seconds?: number }).retry_after_seconds);
    return {
      allowed,
      retryAfterMs: allowed ? undefined : Math.max(0, retryAfterSeconds) * 1000,
    };
  } catch {
    return { allowed: true, degraded: true };
  }
}

/** Opportunistic cleanup so expired buckets do not accumulate; failure is not worth surfacing. */
export async function pruneRateLimits(): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rpc = supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
    await rpc("prune_chat_rate_limits", { p_older_than_seconds: 3600 });
  } catch {
    // Best effort only.
  }
}

export function requestKeyFromHeaders(headers: Headers, userId: string | null): string {
  if (userId) return `user:${userId}`;
  // CF-Connecting-IP is set by Cloudflare's edge and cannot be spoofed by the client past it;
  // fall back through the standard forwarded-for chain for other hosts.
  const ip =
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown";
  // The durable limiter persists this key, so store a hash rather than the address itself: the
  // counter only needs to distinguish clients, never to identify them.
  return `ip:${hashIp(ip)}`;
}

// FNV-1a. Not a security hash -- it only has to be stable, fast, and non-reversible enough that
// the stored key is not a plaintext IP. Web Crypto's digest is async and this sits on the hot path.
function hashIp(ip: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < ip.length; i += 1) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function validateMessagePayload(
  messages: unknown[],
): { ok: true } | { ok: false; error: string } {
  if (messages.length > MAX_MESSAGES) {
    return { ok: false, error: `Too many messages (max ${MAX_MESSAGES})` };
  }
  let totalChars = 0;
  for (const m of messages as Array<{ parts?: Array<{ type: string; text?: string }> }>) {
    for (const part of m.parts ?? []) {
      if (part.type === "text" && typeof part.text === "string") {
        totalChars += part.text.length;
      }
    }
  }
  if (totalChars > MAX_TOTAL_INPUT_CHARS) {
    return { ok: false, error: `Input too long (max ${MAX_TOTAL_INPUT_CHARS} characters)` };
  }
  return { ok: true };
}

/**
 * Anonymous callers are capped at "cheap" tier models regardless of what they request — the model
 * id is otherwise fully caller-supplied, and the list includes openai/gpt-5. Authenticated callers
 * may use "moderate"; "expensive" is reserved for approved profiles (checked by the caller before
 * this function runs, via the same profile.status the rest of the app already gates on).
 */
export function resolveAllowedModel(
  requestedModelId: string,
  defaultModelId: string,
  isAuthenticated: boolean,
  isApproved: boolean,
): string {
  const byId = new Map<string, AdvisorModel>(ADVISOR_MODELS.map((m) => [m.id, m]));
  const requested = byId.get(requestedModelId);
  const fallback = byId.get(defaultModelId) ?? ADVISOR_MODELS[0];

  const maxTier: AdvisorModel["tier"] = isApproved
    ? "expensive"
    : isAuthenticated
      ? "moderate"
      : "cheap";
  const tierRank: Record<AdvisorModel["tier"], number> = { cheap: 0, moderate: 1, expensive: 2 };

  if (requested && tierRank[requested.tier] <= tierRank[maxTier]) {
    return requested.id;
  }
  // Requested model is unknown or exceeds the caller's tier — silently downgrade to the default
  // rather than erroring, so the UI never needs a special-case error path for this.
  return tierRank[fallback.tier] <= tierRank[maxTier] ? fallback.id : ADVISOR_MODELS[0].id;
}
