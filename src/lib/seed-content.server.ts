// Shared content-seed helper used by the admin server fn and the public cron webhook.
// Replays bundled content/ JSON + markdown into Supabase via the service-role client.
// Computes a content signature so the cron webhook can skip when nothing changed.

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const topicsJson = import.meta.glob("/content/topics.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const sourceJsons = import.meta.glob("/content/sources/*.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const blogJsons = import.meta.glob("/content/articles/*.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const designJsons = import.meta.glob("/content/designs/*.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const diagramAssets = import.meta.glob("/content/diagrams/assets.json", { eager: true }) as Record<
  string,
  { default: any }
>;
const helpMd = import.meta.glob("/content/help/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const CAPABILITY_NAMES: Record<string, { name: string; accent: string }> = {
  "fabric-platform": { name: "Fabric Platform", accent: "indigo" },
  capacity: { name: "Capacity & Cost", accent: "amber" },
  purview: { name: "Governance & Purview", accent: "violet" },
  onelake: { name: "OneLake", accent: "teal" },
  lakehouse: { name: "Lakehouse", accent: "teal" },
  mirroring: { name: "Mirroring", accent: "teal" },
  spark: { name: "Spark", accent: "rose" },
  "data-factory": { name: "Data Factory", accent: "rose" },
  "dataflow-gen2": { name: "Dataflow Gen2", accent: "rose" },
  warehouse: { name: "Warehouse", accent: "yellow" },
  polaris: { name: "Polaris SQL Engine", accent: "yellow" },
  "sql-database": { name: "SQL Database in Fabric", accent: "yellow" },
  "direct-lake": { name: "Direct Lake", accent: "indigo" },
  "semantic-model": { name: "Semantic Model", accent: "indigo" },
  "power-bi": { name: "Power BI", accent: "indigo" },
  rti: { name: "Real-Time Intelligence", accent: "rose" },
  "eventhouse-kql": { name: "Eventhouse / KQL", accent: "rose" },
  "fabric-data-agent": { name: "Fabric Data Agent", accent: "violet" },
  "fabric-iq": { name: "Fabric IQ", accent: "violet" },
  "graphql-api": { name: "GraphQL API", accent: "violet" },
};

export function computeContentSignature(): string {
  const h = createHash("sha256");
  const collect: Array<[string, string]> = [];
  for (const [p, m] of Object.entries(topicsJson)) collect.push([p, JSON.stringify(m.default)]);
  for (const [p, m] of Object.entries(sourceJsons)) collect.push([p, JSON.stringify(m.default)]);
  for (const [p, m] of Object.entries(blogJsons)) collect.push([p, JSON.stringify(m.default)]);
  for (const [p, m] of Object.entries(designJsons)) collect.push([p, JSON.stringify(m.default)]);
  for (const [p, m] of Object.entries(diagramAssets)) collect.push([p, JSON.stringify(m.default)]);
  for (const [p, body] of Object.entries(helpMd)) collect.push([p, body]);
  collect.sort(([a], [b]) => a.localeCompare(b));
  for (const [p, body] of collect) h.update(p).update("\0").update(body).update("\0");
  return h.digest("hex");
}

export type SeedSummary = {
  signature: string;
  sourceRowsUpserted: number;
  claimsInserted: number;
  blogRowsUpserted: number;
  topicRowsUpserted: number;
  designRowsUpserted: number;
  diagramRowsUpserted: number;
  helpRowsUpserted: number;
};

export async function runContentSeed(supabaseAdmin: SupabaseClient): Promise<SeedSummary> {
  const summary: SeedSummary = {
    signature: computeContentSignature(),
    sourceRowsUpserted: 0,
    claimsInserted: 0,
    blogRowsUpserted: 0,
    topicRowsUpserted: 0,
    designRowsUpserted: 0,
    diagramRowsUpserted: 0,
    helpRowsUpserted: 0,
  };

  const topicsArr: any[] = Object.values(topicsJson)[0]?.default ?? [];
  const sources = Object.entries(sourceJsons).map(([path, m]) => ({
    slug: path.split("/").pop()!.replace(".json", ""),
    data: (m as any).default,
  }));
  const blogs: any[] = Object.values(blogJsons).map((m) => m.default);
  const designs = Object.entries(designJsons).map(([path, m]) => ({
    slug: path.split("/").pop()!.replace(".json", ""),
    data: (m as any).default,
  }));
  const diagrams: any[] = Object.values(diagramAssets)[0]?.default ?? [];

  // 1) Capabilities
  const capIds = new Set<string>();
  for (const t of topicsArr) (t.capability_ids ?? []).forEach((id: string) => capIds.add(id));
  for (const { data: s } of sources)
    (s.claims ?? []).forEach((c: any) => c.capability_id && capIds.add(c.capability_id));
  const capRows = [...capIds].map((id) => ({
    id,
    name: CAPABILITY_NAMES[id]?.name ?? id,
    accent: CAPABILITY_NAMES[id]?.accent ?? "teal",
    description: "",
  }));
  if (capRows.length) {
    const { error } = await supabaseAdmin
      .from("capabilities")
      .upsert(capRows, { onConflict: "id" });
    if (error) throw new Error(`capabilities: ${error.message}`);
  }

  // 2) Topics
  const ordered = [...topicsArr].sort((a, b) => (a.parent_slug ? 1 : 0) - (b.parent_slug ? 1 : 0));
  for (const t of ordered) {
    const { error } = await supabaseAdmin.from("topics").upsert(
      {
        slug: t.slug,
        parent_slug: t.parent_slug ?? null,
        name: t.name,
        description: t.description ?? "",
        sort_order: t.order ?? 0,
      },
      { onConflict: "slug" },
    );
    if (error) throw new Error(`topic ${t.slug}: ${error.message}`);
    summary.topicRowsUpserted++;
  }

  await supabaseAdmin.from("topic_capabilities").delete().neq("topic_slug", "__never__");
  const tcRows: { topic_slug: string; capability_id: string }[] = [];
  for (const t of topicsArr)
    for (const id of t.capability_ids ?? []) tcRows.push({ topic_slug: t.slug, capability_id: id });
  if (tcRows.length) await supabaseAdmin.from("topic_capabilities").upsert(tcRows);

  // 3) Sources + claims
  const slugToId = new Map<string, string>();
  for (const { slug, data: s } of sources) {
    const { data: ins, error } = await supabaseAdmin
      .from("sources")
      .upsert(
        {
          slug,
          url: s.url,
          title: s.title,
          tier: s.tier ?? 6,
          tags: s.tags ?? [],
          summary: s.summary ?? "",
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (error) throw new Error(`source ${slug}: ${error.message}`);
    slugToId.set(slug, ins.id);
    summary.sourceRowsUpserted++;
    // Non-destructive refresh: delete ONLY this source's pending claims. Verified / rejected /
    // superseded rows survive so human curation persists across re-seeds and redeploys.
    await supabaseAdmin.from("claims").delete().eq("source_id", ins.id).eq("status", "pending");
    // Dedup: skip incoming rows whose (capability_id, normalized text) already exist as a
    // non-pending (curated) claim on this source, to avoid a pending duplicate next to a
    // verified copy.
    const { data: kept } = await supabaseAdmin
      .from("claims")
      .select("capability_id, text")
      .eq("source_id", ins.id)
      .neq("status", "pending");
    const norm = (t: string) => (t ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    const keptKeys = new Set(
      (kept ?? []).map((c: any) => `${c.capability_id}::${norm(c.text)}`),
    );
    const rows = (s.claims ?? [])
      .filter((c: any) => c.capability_id && capIds.has(c.capability_id))
      .filter((c: any) => !keptKeys.has(`${c.capability_id}::${norm(c.text)}`))
      .map((c: any) => ({
        source_id: ins.id,
        capability_id: c.capability_id,
        text: c.text,
        depth: c.depth ?? 2,
        type: c.type ?? "fact",
        tags: c.tags ?? [],
      }));
    if (rows.length) {
      const { error: e2 } = await supabaseAdmin.from("claims").insert(rows);
      if (e2) throw new Error(`claims ${slug}: ${e2.message}`);
      summary.claimsInserted += rows.length;
    }
  }

  // Upsert-by-(kind,slug) helper for the full-reset seeders below. content_items only has a
  // PARTIAL unique index on (kind, slug) WHERE active — Postgres can't use that as an ON CONFLICT
  // target via a plain upsert({onConflict}) call (no WHERE clause support there), so this finds
  // the active row manually and updates it in place, or inserts a fresh v1 row if none exists.
  // This is a full-reset replay, not the versioned single-item publish path (publishContentItem)
  // — appropriate here since it's meant to bootstrap an empty environment or explicitly reset
  // bundled content, never the routine authoring flow.
  async function upsertContentItem(row: { kind: string; slug: string; [key: string]: unknown }) {
    const { data: existing } = await supabaseAdmin
      .from("content_items")
      .select("id")
      .eq("kind", row.kind)
      .eq("slug", row.slug)
      .eq("active", true)
      .maybeSingle();
    if (existing?.id) {
      const { data: updated, error } = await supabaseAdmin
        .from("content_items")
        .update(row as any)
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) throw new Error(`${row.kind} ${row.slug}: ${error.message}`);
      return updated;
    }
    const { data: inserted, error } = await supabaseAdmin
      .from("content_items")
      .insert({ ...row, version: 1, active: true } as any)
      .select("id")
      .single();
    if (error) throw new Error(`${row.kind} ${row.slug}: ${error.message}`);
    return inserted;
  }

  // 4) Articles (kind='article')
  for (const b of blogs) {
    const ins = await upsertContentItem({
      kind: "article",
      slug: b.slug,
      topic_slug: b.topic_slug ?? null,
      title: b.title,
      summary: b.summary ?? "",
      body_md: b.body_md ?? "",
      status: "published",
    });
    summary.blogRowsUpserted++;
    await supabaseAdmin.from("content_item_sources").delete().eq("content_item_id", ins.id);
    const keys: string[] = b.cited_source_keys ?? [];
    const rows = keys
      .map((k, i) => {
        const sid = slugToId.get(k);
        return sid
          ? { content_item_id: ins.id, source_id: sid, label: `S${i + 1}`, position: i }
          : null;
      })
      .filter(Boolean) as any[];
    if (rows.length) await supabaseAdmin.from("content_item_sources").insert(rows);
  }

  // 5) Designs (kind='design')
  for (const { slug: fileSlug, data: d } of designs) {
    const slug = d.slug ?? fileSlug;
    const ins = await upsertContentItem({
      kind: "design",
      slug,
      topic_slug: d.topic_slug ?? null,
      title: d.title ?? slug,
      summary: d.summary ?? "",
      body_md: d.body_md ?? "",
      status: "published",
    });
    summary.designRowsUpserted++;
    await supabaseAdmin.from("content_item_sources").delete().eq("content_item_id", ins.id);
    const keys: string[] = d.cited_source_keys ?? [];
    const rows = keys
      .map((k, i) => {
        const sid = slugToId.get(k);
        return sid
          ? { content_item_id: ins.id, source_id: sid, label: `S${i + 1}`, position: i }
          : null;
      })
      .filter(Boolean) as any[];
    if (rows.length) await supabaseAdmin.from("content_item_sources").insert(rows);
  }

  // 6) Diagrams
  await supabaseAdmin.from("diagrams").delete().neq("slug", "__never__");
  const diagRows = diagrams.map((d: any) => {
    const slug = d.path
      .split("/")
      .pop()
      .replace(/\.(svg|mmd)$/i, "");
    return {
      slug,
      path: `/diagrams/${slug}.svg`,
      caption: d.caption ?? "",
      kind: d.kind ?? "architecture",
      topic_slug: null,
    };
  });
  if (diagRows.length) {
    await supabaseAdmin.from("diagrams").upsert(diagRows, { onConflict: "slug" });
    summary.diagramRowsUpserted = diagRows.length;
  }

  // 7) Help
  await supabaseAdmin.from("help_docs").delete().neq("slug", "__never__");
  const helpRows = Object.entries(helpMd).map(([path, body]) => {
    const file = path.split("/").pop()!.replace(".md", "");
    const m = file.match(/^(\d+)-(.+)$/);
    const order = m ? parseInt(m[1]) : 0;
    const slug = m ? m[2] : file;
    const titleLine = body.split("\n").find((l) => l.startsWith("#")) ?? slug;
    return {
      slug,
      title: titleLine.replace(/^#+\s*/, ""),
      body_md: body,
      sort_order: order,
    };
  });
  if (helpRows.length) {
    await supabaseAdmin.from("help_docs").upsert(helpRows, { onConflict: "slug" });
    summary.helpRowsUpserted = helpRows.length;
  }

  return summary;
}
