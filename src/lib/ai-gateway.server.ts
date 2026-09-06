import { appUrl } from "./app-url";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    supportsStructuredOutputs: true,
  });
}

export type OpenRouterPolicy = {
  free_tier_only: boolean;
  primary_model: string;
  fallback_models: string[];
  prevent_cost_runs: boolean;
};

export function createOpenRouterProvider(
  openRouterApiKey: string,
  _policy?: OpenRouterPolicy | null,
) {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      Authorization: `Bearer ${openRouterApiKey.trim()}`,
      "HTTP-Referer": appUrl(),
      "X-Title": "Fabric Codex",
    },
    supportsStructuredOutputs: true,
  });
}

// Cloudflare Workers AI. Exposes an OpenAI-compatible endpoint, so it drops into the same
// createOpenAICompatible pattern as the others -- no new SDK.
//
// Routed through Cloudflare AI Gateway when a gateway id is configured, which is purely a
// base-URL change and buys caching, retries, rate limiting and per-model analytics. Without one
// it talks to the account endpoint directly, so a missing gateway degrades rather than breaks.
export function createWorkersAiProvider(
  accountId: string,
  apiToken: string,
  gatewayId?: string | null,
) {
  const base = gatewayId?.trim()
    ? `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId.trim()}/workers-ai/v1`
    : `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;
  return createOpenAICompatible({
    name: "workers-ai",
    baseURL: base,
    headers: { Authorization: `Bearer ${apiToken.trim()}` },
    supportsStructuredOutputs: true,
  });
}

/** One entry in the admin-ordered priority chain. */
export type ChainEntry = {
  provider: "workers-ai" | "openrouter" | "lovable";
  model_id: string;
};

/**
 * The stored routing policy.
 *
 * `chain` supersedes the old `primary_model` + `fallback_models` pair -- those were
 * OpenRouter-only, and `fallback_models` was written by the settings UI but never read by any
 * runtime path, so configured fallbacks silently did nothing. Both legacy fields are still read
 * on load and migrated into `chain` so existing settings survive.
 */
export type ProviderChainPolicy = {
  chain: ChainEntry[];
  /** Free-first. Paid entries can only enter the chain when an admin opts in. */
  allow_paid: boolean;
  /** Cloudflare AI Gateway id; empty means talk to each provider directly. */
  ai_gateway_id?: string | null;
};

export const DEFAULT_CHAIN_POLICY: ProviderChainPolicy = {
  chain: [],
  allow_paid: false,
  ai_gateway_id: null,
};

/**
 * Fold a legacy OpenRouterPolicy into the unified chain.
 *
 * Deliberately does NOT carry the hardcoded model ids across: every free id that shipped in
 * DEFAULT_OPENROUTER_POLICY has since been withdrawn from OpenRouter's catalogue (verified
 * 2026-09-06 -- 4 of 5 gone). Migrating dead ids would reproduce the bug this replaces, so the
 * chain starts empty and the admin populates it from the live catalogue.
 */
export function migrateLegacyPolicy(
  legacy: OpenRouterPolicy | null | undefined,
): ProviderChainPolicy {
  if (!legacy) return { ...DEFAULT_CHAIN_POLICY };
  return {
    chain: [],
    allow_paid: !legacy.free_tier_only && !legacy.prevent_cost_runs,
    ai_gateway_id: null,
  };
}

export type ResolvedAiProvider = {
  provider: ReturnType<typeof createOpenAICompatible>;
  providerName: "lovable" | "openrouter";
  apiKey: string;
  source: "db" | "env";
  openrouterPolicy?: OpenRouterPolicy;
};

/** Errors worth advancing the chain for: capacity, outage, or a model that no longer exists. */
export function isRetryableProviderError(error: unknown): boolean {
  const err = error as { statusCode?: number; status?: number; message?: string } | null;
  const code = err?.statusCode ?? err?.status;
  if (typeof code === "number") {
    // 429 rate limit / neuron exhaustion, 5xx outage, 404 model withdrawn, 402 out of credit.
    if (code === 429 || code === 404 || code === 402 || code >= 500) return true;
    // 400 is usually a real bug (bad schema), EXCEPT when it names a missing model.
    if (code === 400 && /model|not found|unavailable|decommission/i.test(err?.message ?? ""))
      return true;
    return false;
  }
  // No status: network-level failure. Worth trying the next entry.
  return /fetch failed|network|timeout|ECONNRESET|socket hang up/i.test(err?.message ?? "");
}

export type ChainAttempt = { provider: string; model_id: string; error: string };

/**
 * Walk the ordered chain, advancing on retryable failures only.
 *
 * This is the single failover path. Both the advisor and article-ideas generation call it, which
 * is what stops article-ideas keeping its own hardcoded ladder that ended in a PAID model and so
 * bypassed the zero-cost guardrail entirely.
 *
 * Chain order is honoured exactly as the admin set it -- no hidden reordering, no implicit
 * preference for free over paid once an entry is in the list.
 */
export async function runWithChain<T>(
  chain: ChainEntry[],
  attempt: (entry: ChainEntry) => Promise<T>,
): Promise<{ result: T; used: ChainEntry; attempts: ChainAttempt[] }> {
  if (!chain.length)
    throw new Error("No AI providers are configured. Add one in Settings → API Keys.");
  const attempts: ChainAttempt[] = [];
  let lastError: unknown;
  for (const entry of chain) {
    try {
      const result = await attempt(entry);
      return { result, used: entry, attempts };
    } catch (error) {
      lastError = error;
      attempts.push({
        provider: entry.provider,
        model_id: entry.model_id,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!isRetryableProviderError(error)) throw error;
    }
  }
  const summary = attempts.map((a) => `${a.provider}/${a.model_id}: ${a.error}`).join("; ");
  throw new Error(`Every configured AI provider failed (${attempts.length} tried). ${summary}`, {
    cause: lastError,
  });
}

export function resolveModelForProvider(
  requestedModelId: string,
  activeAi: ResolvedAiProvider,
): string {
  if (activeAi.providerName === "openrouter" && activeAi.openrouterPolicy) {
    const policy = activeAi.openrouterPolicy;
    // Strict zero-cost guardrail: if free tier only is enabled, ensure only :free models are used
    if (policy.free_tier_only) {
      if (requestedModelId.endsWith(":free")) {
        return requestedModelId;
      }
      return policy.primary_model || "google/gemini-2.5-flash:free";
    }
    if (!requestedModelId && policy.primary_model) {
      return policy.primary_model;
    }
  }
  return requestedModelId;
}

export async function resolveActiveAiProvider(options?: {
  preferredProvider?: "lovable" | "openrouter";
  requestedModel?: string;
}): Promise<ResolvedAiProvider | null> {
  const isSpecializedModel =
    options?.requestedModel &&
    (options.requestedModel.endsWith(":free") ||
      options.requestedModel.startsWith("deepseek/") ||
      options.requestedModel.startsWith("meta-llama/") ||
      options.requestedModel.startsWith("qwen/") ||
      options.requestedModel.startsWith("mistralai/") ||
      options.requestedModel.startsWith("anthropic/") ||
      options.requestedModel.startsWith("openrouter/"));

  const preferOpenRouter = options?.preferredProvider === "openrouter" || isSpecializedModel;

  // 1. Check system_settings in Supabase (highest priority: admin configured in UI)
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", ["lovable_api_key", "openrouter_api_key", "openrouter_policy"]);

    let openrouterPolicy: OpenRouterPolicy | undefined;
    const policyRow = data?.find((r) => r.key === "openrouter_policy" && r.value?.trim());
    if (policyRow?.value) {
      try {
        openrouterPolicy = JSON.parse(policyRow.value);
      } catch {
        // Fall back
      }
    }

    const lovRow = data?.find((r) => r.key === "lovable_api_key" && r.value?.trim());
    const orRow = data?.find((r) => r.key === "openrouter_api_key" && r.value?.trim());

    if (preferOpenRouter && orRow && orRow.value.trim()) {
      return {
        provider: createOpenRouterProvider(orRow.value.trim(), openrouterPolicy),
        providerName: "openrouter",
        apiKey: orRow.value.trim(),
        source: "db",
        openrouterPolicy,
      };
    }

    if (lovRow && lovRow.value.trim()) {
      return {
        provider: createLovableAiGatewayProvider(lovRow.value.trim()),
        providerName: "lovable",
        apiKey: lovRow.value.trim(),
        source: "db",
      };
    }

    if (orRow && orRow.value.trim()) {
      return {
        provider: createOpenRouterProvider(orRow.value.trim(), openrouterPolicy),
        providerName: "openrouter",
        apiKey: orRow.value.trim(),
        source: "db",
        openrouterPolicy,
      };
    }
  } catch {
    // If DB is offline or table unmigrated, fall through to process.env
  }

  // 2. Check process.env (Lovable by default for advisor/automations, OpenRouter for specialized)
  const envLov = process.env.LOVABLE_API_KEY?.trim();
  const envOr = process.env.OPENROUTER_API_KEY?.trim();

  const freeTierEnv = process.env.OPENROUTER_FREE_TIER === "1";
  const envPolicy: OpenRouterPolicy = {
    free_tier_only: freeTierEnv,
    primary_model: process.env.OPENROUTER_PRIMARY_MODEL || "google/gemini-2.5-flash:free",
    fallback_models: (process.env.OPENROUTER_FALLBACK_MODELS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    prevent_cost_runs: true,
  };

  if (preferOpenRouter && envOr) {
    return {
      provider: createOpenRouterProvider(envOr, envPolicy),
      providerName: "openrouter",
      apiKey: envOr,
      source: "env",
      openrouterPolicy: envPolicy,
    };
  }

  if (envLov) {
    return {
      provider: createLovableAiGatewayProvider(envLov),
      providerName: "lovable",
      apiKey: envLov,
      source: "env",
    };
  }

  if (envOr) {
    return {
      provider: createOpenRouterProvider(envOr, envPolicy),
      providerName: "openrouter",
      apiKey: envOr,
      source: "env",
      openrouterPolicy: envPolicy,
    };
  }

  return null;
}

/**
 * Load the admin-ordered chain and the credentials each entry needs.
 *
 * Returns the chain plus a factory, so callers hand entries to runWithChain without knowing how
 * any provider is constructed. Entries whose provider has no credentials configured are dropped
 * here rather than failing mid-request.
 */
export async function resolveProviderChain(): Promise<{
  chain: ChainEntry[];
  allowPaid: boolean;
  providerFor: (entry: ChainEntry) => ReturnType<typeof createOpenAICompatible>;
} | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("key, value")
    .in("key", [
      "provider_chain",
      "openrouter_api_key",
      "lovable_api_key",
      "cloudflare_account_id",
      "cloudflare_api_token",
    ]);
  const rows = (data ?? []) as { key: string; value: string | null }[];
  const val = (k: string) => rows.find((r) => r.key === k)?.value?.trim() || null;

  let policy: ProviderChainPolicy = { ...DEFAULT_CHAIN_POLICY };
  const raw = val("provider_chain");
  if (raw) {
    try {
      policy = { ...DEFAULT_CHAIN_POLICY, ...(JSON.parse(raw) as ProviderChainPolicy) };
    } catch {
      // Unparseable policy behaves as unconfigured rather than crashing every AI request.
    }
  }
  if (!policy.chain?.length) return null;

  const openRouterKey = val("openrouter_api_key") ?? process.env.OPENROUTER_API_KEY?.trim() ?? null;
  const lovableKey = val("lovable_api_key") ?? process.env.LOVABLE_API_KEY?.trim() ?? null;
  const cfAccount =
    val("cloudflare_account_id") ?? process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? null;
  const cfToken = val("cloudflare_api_token") ?? process.env.CLOUDFLARE_API_TOKEN?.trim() ?? null;

  const usable = (e: ChainEntry) =>
    e.provider === "openrouter"
      ? Boolean(openRouterKey)
      : e.provider === "lovable"
        ? Boolean(lovableKey)
        : Boolean(cfAccount && cfToken);

  const chain = policy.chain.filter(usable);
  if (!chain.length) return null;

  return {
    chain,
    allowPaid: policy.allow_paid,
    providerFor: (entry) => {
      if (entry.provider === "openrouter") return createOpenRouterProvider(openRouterKey!);
      if (entry.provider === "lovable") return createLovableAiGatewayProvider(lovableKey!);
      return createWorkersAiProvider(cfAccount!, cfToken!, policy.ai_gateway_id);
    },
  };
}
