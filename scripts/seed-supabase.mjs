#!/usr/bin/env node
// One-shot seeder: replays content/ JSON into Supabase using service role.
// Mirrors src/lib/seed.functions.ts logic, runnable from the sandbox.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
const sb = createClient(url, key, { auth: { persistSession: false } });

const CAP = {
  "fabric-platform": ["Fabric Platform", "indigo"],
  capacity: ["Capacity & Cost", "amber"],
  purview: ["Governance & Purview", "violet"],
  onelake: ["OneLake", "teal"],
  lakehouse: ["Lakehouse", "teal"],
  mirroring: ["Mirroring", "teal"],
  spark: ["Spark", "rose"],
  "data-factory": ["Data Factory", "rose"],
  "dataflow-gen2": ["Dataflow Gen2", "rose"],
  warehouse: ["Warehouse", "yellow"],
  polaris: ["Polaris SQL Engine", "yellow"],
  "sql-database": ["SQL Database in Fabric", "yellow"],
  "direct-lake": ["Direct Lake", "indigo"],
  "semantic-model": ["Semantic Model", "indigo"],
  "power-bi": ["Power BI", "indigo"],
  rti: ["Real-Time Intelligence", "rose"],
  "eventhouse-kql": ["Eventhouse / KQL", "rose"],
  "fabric-data-agent": ["Fabric Data Agent", "violet"],
  "fabric-iq": ["Fabric IQ", "violet"],
  "graphql-api": ["GraphQL API", "violet"],
};

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const listJson = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => ({ slug: f.replace(/\.json$/, ""), data: readJson(join(dir, f)) }))
    : [];

const sources = listJson("content/sources");
const blogs = listJson("content/articles").map((b) => b.data);
const designs = listJson("content/designs");
const lessons = listJson("content/lessons");
const topics = existsSync("content/topics.json") ? readJson("content/topics.json") : [];
const diagrams = existsSync("content/diagrams/assets.json")
  ? readJson("content/diagrams/assets.json")
  : [];

const capIds = new Set();
for (const t of topics) (t.capability_ids ?? []).forEach((id) => capIds.add(id));
for (const { data: s } of sources)
  (s.claims ?? []).forEach((c) => c.capability_id && capIds.add(c.capability_id));

const must = async (label, p) => {
  const { error, data } = await p;
  if (error) {
    console.error(label, error);
    throw error;
  }
  return data;
};

// Capabilities
const capRows = [...capIds].map((id) => ({
  id,
  name: CAP[id]?.[0] ?? id,
  accent: CAP[id]?.[1] ?? "teal",
  description: "",
}));
if (capRows.length)
  await must("caps", sb.from("capabilities").upsert(capRows, { onConflict: "id" }));
console.log("capabilities:", capRows.length);

// Topics
const ordered = [...topics].sort((a, b) => (a.parent_slug ? 1 : 0) - (b.parent_slug ? 1 : 0));
for (const t of ordered) {
  await must(
    `topic ${t.slug}`,
    sb.from("topics").upsert(
      {
        slug: t.slug,
        parent_slug: t.parent_slug ?? null,
        name: t.name,
        description: t.description ?? "",
        sort_order: t.order ?? 0,
      },
      { onConflict: "slug" },
    ),
  );
}
console.log("topics:", topics.length);

await sb.from("topic_capabilities").delete().neq("topic_slug", "__never__");
const tcRows = [];
for (const t of topics)
  for (const id of t.capability_ids ?? []) tcRows.push({ topic_slug: t.slug, capability_id: id });
if (tcRows.length) await must("tc", sb.from("topic_capabilities").upsert(tcRows));

// Sources + claims
const slugToId = new Map();
let claimCount = 0;
for (const { slug, data: s } of sources) {
  const ins = await must(
    `src ${slug}`,
    sb
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
      .single(),
  );
  slugToId.set(slug, ins.id);
  await sb.from("claims").delete().eq("source_id", ins.id);
  const rows = (s.claims ?? [])
    .filter((c) => c.capability_id && capIds.has(c.capability_id))
    .map((c) => ({
      source_id: ins.id,
      capability_id: c.capability_id,
      text: c.text,
      depth: c.depth ?? 2,
      type: c.type ?? "fact",
      tags: c.tags ?? [],
    }));
  if (rows.length) {
    await must(`claims ${slug}`, sb.from("claims").insert(rows));
    claimCount += rows.length;
  }
}
console.log("sources:", sources.length, "claims:", claimCount);

// Upsert-by-(kind,slug) helper. content_items only has a PARTIAL unique index on (kind, slug)
// WHERE active, which a plain upsert({onConflict}) call can't target (no WHERE clause support
// there) — find the active row manually and update in place, or insert a fresh v1 row.
const upsertContentItem = async (row) => {
  const { data: existing } = await sb
    .from("content_items")
    .select("id")
    .eq("kind", row.kind)
    .eq("slug", row.slug)
    .eq("active", true)
    .maybeSingle();
  if (existing?.id) {
    return must(
      `${row.kind} ${row.slug}`,
      sb.from("content_items").update(row).eq("id", existing.id).select("id").single(),
    );
  }
  return must(
    `${row.kind} ${row.slug}`,
    sb
      .from("content_items")
      .insert({ ...row, version: 1, active: true })
      .select("id")
      .single(),
  );
};

// Articles (kind='article')
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
  await sb.from("content_item_sources").delete().eq("content_item_id", ins.id);
  const keys = b.cited_source_keys ?? [];
  const rows = keys
    .map((k, i) => {
      const sid = slugToId.get(k);
      return sid
        ? { content_item_id: ins.id, source_id: sid, label: `S${i + 1}`, position: i }
        : null;
    })
    .filter(Boolean);
  if (rows.length) await sb.from("content_item_sources").insert(rows);
}
console.log("articles:", blogs.length);

// Designs (kind='design')
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
  await sb.from("content_item_sources").delete().eq("content_item_id", ins.id);
  const keys = d.cited_source_keys ?? [];
  const rows = keys
    .map((k, i) => {
      const sid = slugToId.get(k);
      return sid
        ? { content_item_id: ins.id, source_id: sid, label: `S${i + 1}`, position: i }
        : null;
    })
    .filter(Boolean);
  if (rows.length) await sb.from("content_item_sources").insert(rows);
}
console.log("designs:", designs.length);

// Diagrams
await sb.from("diagrams").delete().neq("slug", "__never__");
const diagRows = diagrams.map((d) => {
  const slug = d.path
    .split("/")
    .pop()
    .replace(/\.(svg|mmd)$/i, "");
  return {
    slug,
    path: `/diagrams/${slug}.svg`,
    caption: d.caption ?? "",
    kind: d.kind ?? "architecture",
    topic_slug: d.topic_slug ?? null,
    capability_id: d.capability_id ?? null,
  };
});
if (diagRows.length)
  await must("diagrams", sb.from("diagrams").upsert(diagRows, { onConflict: "slug" }));
console.log("diagrams:", diagRows.length);

// Lessons (kind='lesson')
for (const { slug: fileSlug, data: l } of lessons) {
  const slug = l.slug ?? fileSlug;
  const ins = await upsertContentItem({
    kind: "lesson",
    slug,
    topic_slug: l.topic_slug ?? null,
    capability_id: l.capability_id ?? null,
    title: l.title ?? slug,
    summary: l.summary ?? "",
    body_md: l.body_md ?? "",
    status: "published",
    depth_levels: l.depth_levels ?? [],
  });
  await sb.from("content_item_sources").delete().eq("content_item_id", ins.id);
  const keys = l.cited_source_keys ?? [];
  const rows = keys
    .map((k, i) => {
      const sid = slugToId.get(k);
      return sid
        ? { content_item_id: ins.id, source_id: sid, label: `S${i + 1}`, position: i }
        : null;
    })
    .filter(Boolean);
  if (rows.length) await sb.from("content_item_sources").insert(rows);
}
console.log("lessons:", lessons.length);

// Help
await sb.from("help_docs").delete().neq("slug", "__never__");
const helpDir = "content/help";
const helpRows = existsSync(helpDir)
  ? readdirSync(helpDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => {
        const body = readFileSync(join(helpDir, f), "utf8");
        const base = f.replace(/\.md$/, "");
        const m = base.match(/^(\d+)-(.+)$/);
        const order = m ? parseInt(m[1]) : 0;
        const slug = m ? m[2] : base;
        const title = (body.split("\n").find((l) => l.startsWith("#")) ?? slug).replace(
          /^#+\s*/,
          "",
        );
        return { slug, title, body_md: body, sort_order: order };
      })
  : [];
if (helpRows.length)
  await must("help", sb.from("help_docs").upsert(helpRows, { onConflict: "slug" }));
console.log("help:", helpRows.length);

console.log("\nDONE");
