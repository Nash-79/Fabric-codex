import { describe, expect, it } from "vitest";
import {
  isRetryableProviderError,
  migrateLegacyPolicy,
  runWithChain,
  type ChainEntry,
} from "./ai-gateway.server";

const entry = (provider: ChainEntry["provider"], model_id: string): ChainEntry => ({
  provider,
  model_id,
});

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message = "") {
    super(message);
    this.statusCode = statusCode;
  }
}

describe("isRetryableProviderError", () => {
  it.each([429, 500, 502, 503, 404, 402])("advances the chain on %i", (code) => {
    expect(isRetryableProviderError(new HttpError(code))).toBe(true);
  });

  it("does not advance on a genuine client error", () => {
    // A 400 from a bad JSON schema is a bug in our request -- retrying every provider would
    // just fail slower and hide the real cause.
    expect(
      isRetryableProviderError(new HttpError(400, "invalid schema: required is missing")),
    ).toBe(false);
  });

  it("advances on a 400 that names a withdrawn model", () => {
    expect(isRetryableProviderError(new HttpError(400, "model not found: foo:free"))).toBe(true);
  });

  it("advances on network-level failure with no status", () => {
    expect(isRetryableProviderError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableProviderError(new Error("socket hang up"))).toBe(true);
  });

  it("does not advance on an unrecognised error", () => {
    expect(isRetryableProviderError(new Error("something else"))).toBe(false);
  });
});

describe("runWithChain", () => {
  it("uses the first entry when it succeeds", async () => {
    const chain = [entry("workers-ai", "a"), entry("openrouter", "b")];
    const { result, used, attempts } = await runWithChain(chain, async (e) => e.model_id);
    expect(result).toBe("a");
    expect(used.provider).toBe("workers-ai");
    expect(attempts).toEqual([]);
  });

  it("advances past a rate-limited entry and reports what it skipped", async () => {
    const chain = [entry("workers-ai", "exhausted"), entry("openrouter", "spare")];
    const { result, used, attempts } = await runWithChain(chain, async (e) => {
      if (e.model_id === "exhausted") throw new HttpError(429, "neurons exhausted");
      return e.model_id;
    });
    expect(result).toBe("spare");
    expect(used.model_id).toBe("spare");
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ provider: "workers-ai", model_id: "exhausted" });
  });

  it("honours the admin's order exactly -- no reordering by price or provider", async () => {
    const seen: string[] = [];
    const chain = [entry("openrouter", "paid-first"), entry("workers-ai", "free-second")];
    await runWithChain(chain, async (e) => {
      seen.push(e.model_id);
      return e.model_id;
    });
    expect(seen).toEqual(["paid-first"]);
  });

  it("stops immediately on a non-retryable error rather than burning the chain", async () => {
    let calls = 0;
    const chain = [entry("workers-ai", "a"), entry("openrouter", "b")];
    await expect(
      runWithChain(chain, async () => {
        calls += 1;
        throw new HttpError(400, "invalid schema");
      }),
    ).rejects.toThrow("invalid schema");
    expect(calls).toBe(1);
  });

  it("reports every attempt when the whole chain fails", async () => {
    const chain = [entry("workers-ai", "a"), entry("openrouter", "b")];
    await expect(
      runWithChain(chain, async () => {
        throw new HttpError(503, "down");
      }),
    ).rejects.toThrow(/Every configured AI provider failed \(2 tried\)/);
  });

  it("fails clearly when nothing is configured", async () => {
    await expect(runWithChain([], async () => "x")).rejects.toThrow(
      /No AI providers are configured/,
    );
  });
});

describe("migrateLegacyPolicy", () => {
  it("does not carry withdrawn model ids into the new chain", () => {
    // Every :free id that shipped in DEFAULT_OPENROUTER_POLICY is gone from OpenRouter's
    // catalogue. Migrating them would reproduce exactly the bug the chain replaces.
    const migrated = migrateLegacyPolicy({
      free_tier_only: true,
      primary_model: "google/gemini-2.5-flash:free",
      fallback_models: ["deepseek/deepseek-r1:free"],
      prevent_cost_runs: true,
    });
    expect(migrated.chain).toEqual([]);
    expect(migrated.allow_paid).toBe(false);
  });

  it("keeps paid access open when the legacy policy allowed it", () => {
    const migrated = migrateLegacyPolicy({
      free_tier_only: false,
      primary_model: "",
      fallback_models: [],
      prevent_cost_runs: false,
    });
    expect(migrated.allow_paid).toBe(true);
  });

  it("defaults to free-only when there is no legacy policy", () => {
    expect(migrateLegacyPolicy(null).allow_paid).toBe(false);
  });
});
