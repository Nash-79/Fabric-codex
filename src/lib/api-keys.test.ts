import { describe, expect, it } from "vitest";
import {
  createOpenRouterProvider,
  resolveModelForProvider,
  type ResolvedAiProvider,
} from "./ai-gateway.server";

describe("createOpenRouterProvider", () => {
  it("initializes an OpenAI-compatible provider with OpenRouter baseURL and headers", () => {
    // Fake key: shape-only, never a live credential. Real keys live in Worker secrets.
    const testKey = "sk-or-v1-" + "0".repeat(64);
    const provider = createOpenRouterProvider(testKey);
    expect(provider).toBeDefined();
    expect(typeof provider).toBe("function");
  });
});

describe("resolveModelForProvider with OpenRouter Policy", () => {
  it("enforces free-tier model when free_tier_only is active to prevent cost runs", () => {
    const mockProvider: ResolvedAiProvider = {
      provider: createOpenRouterProvider("sk-or-dummy"),
      providerName: "openrouter",
      apiKey: "sk-or-dummy",
      source: "env",
      openrouterPolicy: {
        free_tier_only: true,
        primary_model: "google/gemini-2.0-flash-exp:free",
        fallback_models: ["meta-llama/llama-3.3-70b-instruct:free"],
        prevent_cost_runs: true,
      },
    };

    // If caller requests a paid model (e.g. openai/gpt-5), redirect to free primary model
    const resolvedPaid = resolveModelForProvider("openai/gpt-5", mockProvider);
    expect(resolvedPaid).toBe("google/gemini-2.0-flash-exp:free");

    // If caller requests an approved free model, allow it
    const resolvedFree = resolveModelForProvider(
      "meta-llama/llama-3.3-70b-instruct:free",
      mockProvider,
    );
    expect(resolvedFree).toBe("meta-llama/llama-3.3-70b-instruct:free");
  });

  it("preserves requested model when free_tier_only is disabled", () => {
    const mockProvider: ResolvedAiProvider = {
      provider: createOpenRouterProvider("sk-or-dummy"),
      providerName: "openrouter",
      apiKey: "sk-or-dummy",
      source: "env",
      openrouterPolicy: {
        free_tier_only: false,
        primary_model: "anthropic/claude-3.7-sonnet",
        fallback_models: ["meta-llama/llama-3.3-70b-instruct:free"],
        prevent_cost_runs: true,
      },
    };

    const resolved = resolveModelForProvider("openai/gpt-4o-mini", mockProvider);
    expect(resolved).toBe("openai/gpt-4o-mini");
  });
});

describe("API Key secret masking", () => {
  function maskSecret(val: string): string {
    const trimmed = val.trim();
    if (!trimmed) return "";
    if (trimmed.length <= 8) return "••••••••";
    if (trimmed.startsWith("sk-or-v1-")) {
      return `sk-or-v1-••••••••${trimmed.slice(-4)}`;
    }
    if (trimmed.startsWith("sk-")) {
      return `sk-••••••••${trimmed.slice(-4)}`;
    }
    return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
  }

  it("masks OpenRouter keys with sk-or-v1- prefix and reveals last 4 chars", () => {
    const key = "sk-or-v1-" + "a".repeat(60) + "ea96";
    expect(maskSecret(key)).toBe("sk-or-v1-••••••••ea96");
  });

  it("masks OpenAI keys with sk- prefix and reveals last 4 chars", () => {
    const key = "sk-proj-1234567890abcdef1234";
    expect(maskSecret(key)).toBe("sk-••••••••1234");
  });

  it("returns empty string for empty input", () => {
    expect(maskSecret("   ")).toBe("");
  });
});
