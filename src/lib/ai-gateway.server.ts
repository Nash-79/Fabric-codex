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
      "HTTP-Referer": "https://fabric-atlas.dev",
      "X-Title": "Fabric Atlas",
    },
    supportsStructuredOutputs: true,
  });
}

export type ResolvedAiProvider = {
  provider: ReturnType<typeof createOpenAICompatible>;
  providerName: "lovable" | "openrouter";
  apiKey: string;
  source: "db" | "env";
  openrouterPolicy?: OpenRouterPolicy;
};

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
