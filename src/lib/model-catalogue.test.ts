import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildCatalogue,
  fetchOpenRouterModels,
  findUnavailable,
  isFree,
  sortByPrice,
  type CatalogueModel,
} from "./model-catalogue.server";

const model = (over: Partial<CatalogueModel> = {}): CatalogueModel => ({
  id: "x/y",
  provider: "openrouter",
  label: "Y",
  prompt_usd_per_m: 0,
  completion_usd_per_m: 0,
  context_length: 1000,
  supports_tools: false,
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("pricing", () => {
  it("treats only zero-on-both-sides as free", () => {
    expect(isFree(model())).toBe(true);
    expect(isFree(model({ completion_usd_per_m: 0.5 }))).toBe(false);
    expect(isFree(model({ prompt_usd_per_m: 0.1 }))).toBe(false);
  });

  it("sorts cheapest-first by output price, the dominant cost", () => {
    const sorted = sortByPrice([
      model({ id: "pricey", completion_usd_per_m: 10 }),
      model({ id: "free" }),
      model({ id: "cheap", completion_usd_per_m: 0.03 }),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["free", "cheap", "pricey"]);
  });
});

describe("fetchOpenRouterModels", () => {
  it("converts per-token pricing to per-million and reads tool support", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            {
              id: "vendor/model:free",
              name: "Model",
              context_length: 128000,
              pricing: { prompt: "0", completion: "0" },
              supported_parameters: ["tools"],
            },
            {
              id: "vendor/paid",
              pricing: { prompt: "0.0000005", completion: "0.0000015" },
            },
          ],
        }),
      ),
    );
    const models = await fetchOpenRouterModels();
    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({
      id: "vendor/model:free",
      prompt_usd_per_m: 0,
      supports_tools: true,
      context_length: 128000,
    });
    // 0.0000015 per token -> $1.50 per million
    expect(models[1].completion_usd_per_m).toBeCloseTo(1.5, 6);
    expect(models[1].supports_tools).toBe(false);
  });

  it("skips rows with no id rather than emitting a broken entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: [{ name: "no id" }] })),
    );
    expect(await fetchOpenRouterModels()).toEqual([]);
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 503 })),
    );
    await expect(fetchOpenRouterModels()).rejects.toThrow("503");
  });
});

describe("buildCatalogue", () => {
  it("records a provider failure instead of losing the whole catalogue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 500 })),
    );
    const cat = await buildCatalogue({ cloudflareAccountId: null, cloudflareApiToken: null });
    expect(cat.models).toEqual([]);
    expect(cat.errors.openrouter).toMatch(/500/);
  });

  it("skips Workers AI when no credentials are configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: [] })),
    );
    const cat = await buildCatalogue({ cloudflareAccountId: null, cloudflareApiToken: null });
    expect(cat.errors["workers-ai"]).toBeUndefined();
  });
});

describe("findUnavailable", () => {
  const catalogue = {
    models: [model({ id: "live", provider: "openrouter" })],
    fetched_at: "",
    errors: {},
  };

  it("flags a chain entry whose model has been withdrawn", () => {
    // Exactly the situation this replaces: every configured :free id had been withdrawn and
    // nothing surfaced it until a request failed.
    const stale = findUnavailable(
      [
        { provider: "openrouter", model_id: "live" },
        { provider: "openrouter", model_id: "google/gemini-2.5-flash:free" },
      ],
      catalogue,
    );
    expect(stale).toEqual(["openrouter/google/gemini-2.5-flash:free"]);
  });

  it("matches on provider as well as id", () => {
    expect(findUnavailable([{ provider: "workers-ai", model_id: "live" }], catalogue)).toEqual([
      "workers-ai/live",
    ]);
  });

  it("flags nothing when the catalogue is empty, rather than flagging everything", () => {
    // An outage while refreshing must not paint every configured model as dead.
    expect(
      findUnavailable([{ provider: "openrouter", model_id: "live" }], {
        models: [],
        fetched_at: "",
        errors: { openrouter: "500" },
      }),
    ).toEqual([]);
  });
});
