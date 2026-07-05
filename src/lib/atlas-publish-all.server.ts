// "Publish all" — the bulk counterpart to the Settings → Publish paste-one-file flow.
//
// Bundles content/sources, content/articles, content/designs, content/lessons, and content/diagrams/assets.json
// at build time (same import.meta.glob pattern as bundled-content.ts / seed-content.server.ts),
// diffs each against what's already active in Supabase, and republishes only what changed —
// through publishFromFile, one call per item, so every guarantee of the single-file flow still
// holds: sources do a non-destructive claim refresh (verified claims survive), and articles/
// designs/lessons always version (archive old, insert new), never a bare in-place overwrite. This is
// deliberately NOT runContentSeed (that helper updates content_items in place with no version
// bump — fine for bootstrapping an empty environment, wrong for routine republishing).
//
// The unchanged-skip relies on the `document` column publishFromFile writes on every publish.
// Rows published before this feature existed (via the old seed/import path) have an empty
// `document`, so the first publishAllBundled run after this ships will treat everything as
// changed and republish it once — after that, the diff is accurate. This is intentionally the
// safe direction: a false "changed" costs one redundant version, a false "unchanged" would
// silently drop a real edit.
//
// Requires a rebuild/redeploy to pick up new content/* files before "Publish all" can see them —
// the app can't read the laptop filesystem live. That's the same constraint every Lovable change
// already has.

import type { SupabaseClient } from "@supabase/supabase-js";
import { publishFromFile } from "./atlas-publish.services.server";

const sourceJsons = import.meta.glob("/content/sources/*.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const articleJsons = import.meta.glob("/content/articles/*.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const designJsons = import.meta.glob("/content/designs/*.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const lessonJsons = import.meta.glob("/content/lessons/*.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const diagramAssets = import.meta.glob("/content/diagrams/assets.json", { eager: true }) as Record<
  string,
  { default: any[] }
>;

function stem(path: string) {
  return path
    .split("/")
    .pop()!
    .replace(/\.json$/, "");
}

function stableJson(value: unknown): string {
  // Deterministic stringify so key order in the source file doesn't cause false "changed" diffs.
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson((value as any)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type PublishAllItemResult = {
  kind: "source" | "article" | "design" | "lesson" | "diagram";
  slug: string;
  file: string;
  action: "published" | "skipped-unchanged" | "blocked" | "failed";
  reason?: string;
  detail?: JsonValue;
};

export type PublishAllSummary = {
  items: PublishAllItemResult[];
  published: number;
  skipped: number;
  blocked: number;
  failed: number;
};

export async function publishAllBundled(
  sb: SupabaseClient,
  opts: { force?: boolean } = {},
): Promise<PublishAllSummary> {
  const items: PublishAllItemResult[] = [];

  // --- Sources first: content items can't publish until the sources they cite exist. ---
  const { data: existingSources } = await sb
    .from("sources")
    .select("slug,document")
    .eq("active", true);
  const sourceBySlug = new Map<string, any>((existingSources ?? []).map((s: any) => [s.slug, s]));
  const publishedSourceSlugs = new Set<string>();

  for (const [path, mod] of Object.entries(sourceJsons)) {
    const slug = mod.default?.slug ?? stem(path);
    const payload = { ...mod.default, slug };
    const existing = sourceBySlug.get(slug);
    const unchanged =
      !opts.force && existing && stableJson(existing.document) === stableJson(payload);
    if (unchanged) {
      items.push({ kind: "source", slug, file: path, action: "skipped-unchanged" });
      publishedSourceSlugs.add(slug);
      continue;
    }
    try {
      const result = await publishFromFile(sb, "source", payload);
      items.push({ kind: "source", slug, file: path, action: "published", detail: result });
      publishedSourceSlugs.add(slug);
    } catch (err: any) {
      items.push({
        kind: "source",
        slug,
        file: path,
        action: "failed",
        reason: err?.message ?? String(err),
      });
    }
  }
  // Sources already active in Supabase but not touched this run still count as available.
  for (const slug of sourceBySlug.keys()) publishedSourceSlugs.add(slug);

  // --- Diagrams next: articles may embed them, and registration is a plain upsert-by-slug. ---
  const diagramManifest = Object.values(diagramAssets)[0]?.default ?? [];
  for (const entry of diagramManifest) {
    const slug = (entry.path ?? entry.slug ?? "")
      .split("/")
      .pop()
      ?.replace(/\.(svg|mmd)$/i, "");
    if (!slug) continue;
    // Diagram registration is a cheap upsert with no "unchanged" fast-path worth the complexity —
    // caption/kind edits should always take, and re-upserting an identical row is a no-op in Postgres.
    try {
      const result = await publishFromFile(sb, "diagram", entry);
      items.push({
        kind: "diagram",
        slug,
        file: "content/diagrams/assets.json",
        action: "published",
        detail: result,
      });
    } catch (err: any) {
      items.push({
        kind: "diagram",
        slug,
        file: "content/diagrams/assets.json",
        action: "failed",
        reason: err?.message ?? String(err),
      });
    }
  }

  // --- Content items last: each needs its cited sources (and ideally embedded diagrams) live. ---
  async function publishContentItems(
    kind: "article" | "design" | "lesson",
    jsons: Record<string, { default: any }>,
  ) {
    const { data: existingItems } = await sb
      .from("content_items")
      .select("slug,document")
      .eq("kind", kind)
      .eq("active", true);
    const bySlug = new Map<string, any>((existingItems ?? []).map((r: any) => [r.slug, r]));

    for (const [path, mod] of Object.entries(jsons)) {
      const slug = mod.default?.slug ?? stem(path);
      const payload = { ...mod.default, slug };
      const citedKeys: string[] = payload.cited_source_keys ?? [];
      const missingSources = citedKeys.filter((k) => !publishedSourceSlugs.has(k));
      if (missingSources.length) {
        items.push({
          kind,
          slug,
          file: path,
          action: "blocked",
          reason: `cited source(s) not published: ${missingSources.join(", ")}`,
        });
        continue;
      }

      const existing = bySlug.get(slug);
      const unchanged =
        !opts.force && existing && stableJson(existing.document) === stableJson(payload);
      if (unchanged) {
        items.push({ kind, slug, file: path, action: "skipped-unchanged" });
        continue;
      }

      try {
        const result = await publishFromFile(sb, kind, payload);
        items.push({ kind, slug, file: path, action: "published", detail: result });
      } catch (err: any) {
        items.push({
          kind,
          slug,
          file: path,
          action: "failed",
          reason: err?.message ?? String(err),
        });
      }
    }
  }

  await publishContentItems("article", articleJsons);
  await publishContentItems("design", designJsons);
  await publishContentItems("lesson", lessonJsons);

  return {
    items,
    published: items.filter((i) => i.action === "published").length,
    skipped: items.filter((i) => i.action === "skipped-unchanged").length,
    blocked: items.filter((i) => i.action === "blocked").length,
    failed: items.filter((i) => i.action === "failed").length,
  };
}
