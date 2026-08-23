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

export function requestKeyFromHeaders(headers: Headers, userId: string | null): string {
  if (userId) return `user:${userId}`;
  // CF-Connecting-IP is set by Cloudflare's edge and cannot be spoofed by the client past it;
  // fall back through the standard forwarded-for chain for other hosts.
  const ip =
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown";
  return `ip:${ip}`;
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
