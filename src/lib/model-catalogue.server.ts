import { createHash } from "node:crypto";

/**
 * Live model discovery.
 *
 * Hardcoded model ids are the bug this module exists to remove. OpenRouter's free tier rotates:
 * on 2026-09-06 four of the five ids shipped in the codebase had already been withdrawn, so the
 * configured chain was pointing entirely at models that no longer existed. Rather than refresh
 * the constants and wait for them to rot again, the catalogue is fetched and the admin orders
 * what is actually available.
 */

export type CatalogueModel = {
  id: string;
  provider: "openrouter" | "workers-ai";
  label: string;
  /** USD per million prompt tokens. 0 means free. */
  prompt_usd_per_m: number;
  completion_usd_per_m: number;
  context_length: number;
  /** Whether the model advertises function/tool calling -- needed for structured idea generation. */
  supports_tools: boolean;
};

export type Catalogue = {
  models: CatalogueModel[];
  fetched_at: string;
  /** Per-provider fetch errors, so a partial catalogue is visibly partial. */
  errors: Record<string, string>;
};

const PER_MILLION = 1_000_000;

function usdPerMillion(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n * PER_MILLION : Number.POSITIVE_INFINITY;
}

export function isFree(model: CatalogueModel): boolean {
  return model.prompt_usd_per_m === 0 && model.completion_usd_per_m === 0;
}

/** Cheapest first, by the dominant cost (completion tokens), then by name for stability. */
export function sortByPrice(models: CatalogueModel[]): CatalogueModel[] {
  return [...models].sort(
    (a, b) =>
      a.completion_usd_per_m - b.completion_usd_per_m ||
      a.prompt_usd_per_m - b.prompt_usd_per_m ||
      a.id.localeCompare(b.id),
  );
}

export async function fetchOpenRouterModels(): Promise<CatalogueModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`OpenRouter catalogue ${res.status}`);
  const body = (await res.json()) as { data?: unknown[] };
  const rows = Array.isArray(body.data) ? body.data : [];
  return rows.flatMap((raw) => {
    const m = raw as {
      id?: string;
      name?: string;
      context_length?: number;
      pricing?: { prompt?: string; completion?: string };
      supported_parameters?: string[];
    };
    if (!m.id) return [];
    return [
      {
        id: m.id,
        provider: "openrouter" as const,
        label: m.name || m.id,
        prompt_usd_per_m: usdPerMillion(m.pricing?.prompt),
        completion_usd_per_m: usdPerMillion(m.pricing?.completion),
        context_length: m.context_length ?? 0,
        supports_tools: (m.supported_parameters ?? []).includes("tools"),
      },
    ];
  });
}

/**
 * Workers AI text-generation models.
 *
 * Cloudflare's account-scoped model API needs credentials, so this is only callable once an
 * account id and token are configured. Pricing is reported in neurons rather than dollars and
 * the free daily allowance is the relevant budget, so every entry is surfaced as zero-cost --
 * the neuron allowance is enforced by Cloudflare, not by us.
 */
export async function fetchWorkersAiModels(
  accountId: string,
  apiToken: string,
): Promise<CatalogueModel[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?task=Text%20Generation&per_page=100`,
    { headers: { Authorization: `Bearer ${apiToken}` } },
  );
  if (!res.ok) throw new Error(`Workers AI catalogue ${res.status}`);
  const body = (await res.json()) as { result?: unknown[] };
  const rows = Array.isArray(body.result) ? body.result : [];
  return rows.flatMap((raw) => {
    const m = raw as {
      name?: string;
      description?: string;
      properties?: { property_id?: string; value?: string }[];
    };
    if (!m.name) return [];
    const props = m.properties ?? [];
    const ctx = props.find((p) => p.property_id === "context_window")?.value;
    return [
      {
        id: m.name,
        provider: "workers-ai" as const,
        label: m.name.split("/").pop() || m.name,
        prompt_usd_per_m: 0,
        completion_usd_per_m: 0,
        context_length: Number(ctx) || 0,
        supports_tools: props.some(
          (p) => p.property_id === "function_calling" && p.value === "true",
        ),
      },
    ];
  });
}

/**
 * Build the combined catalogue. Never throws for a single provider outage -- a partial
 * catalogue with a recorded error is more useful than none, and the UI shows which half failed.
 */
export async function buildCatalogue(opts: {
  cloudflareAccountId?: string | null;
  cloudflareApiToken?: string | null;
}): Promise<Catalogue> {
  const errors: Record<string, string> = {};
  const models: CatalogueModel[] = [];

  const results = await Promise.allSettled([
    fetchOpenRouterModels(),
    opts.cloudflareAccountId && opts.cloudflareApiToken
      ? fetchWorkersAiModels(opts.cloudflareAccountId, opts.cloudflareApiToken)
      : Promise.resolve([] as CatalogueModel[]),
  ]);

  const names = ["openrouter", "workers-ai"] as const;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") models.push(...r.value);
    else errors[names[i]] = r.reason instanceof Error ? r.reason.message : String(r.reason);
  });

  return { models, fetched_at: new Date().toISOString(), errors };
}

/**
 * Flag chain entries whose model has left the catalogue.
 *
 * This is the check that would have caught the current situation, where every configured free
 * model had been withdrawn and the failure only surfaced at request time.
 */
export function findUnavailable(
  chain: { provider: string; model_id: string }[],
  catalogue: Catalogue,
): string[] {
  if (!catalogue.models.length) return [];
  const known = new Set(catalogue.models.map((m) => `${m.provider}:${m.id}`));
  return chain
    .filter((e) => !known.has(`${e.provider}:${e.model_id}`))
    .map((e) => `${e.provider}/${e.model_id}`);
}

/** Cache key for a catalogue snapshot, so a repeated refresh within the TTL is a no-op. */
export function catalogueFingerprint(c: Catalogue): string {
  return createHash("sha256")
    .update(
      c.models
        .map((m) => m.id)
        .sort()
        .join("\n"),
    )
    .digest("hex")
    .slice(0, 16);
}
