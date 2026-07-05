import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// In-app bootstrap (admin-triggered) that replays the bundled content/ files straight into
// Supabase for no-backend deploys. NOTE: the local/legacy version-aware path is the Python backend —
// `python scripts/import_content.py --base <supabase-backed server>` — which owns claim versioning,
// drift/merge (supersedes_id chains) and the raw `document` snapshot. This bootstrap is deliberately
// a thin UPSERT replay for empty environments or explicit resets: it must never silently reset
// curated status.

// Bundle the content/ JSON and markdown at build time.
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

export const seedFromContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { forceBootstrap?: boolean } | undefined) => d ?? {})
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { count: activeClaimCount, error: countError } = await supabaseAdmin
      .from("claims")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
    if (countError) throw new Error(countError.message);
    if ((activeClaimCount ?? 0) > 0 && !data.forceBootstrap) {
      throw new Error(
        "Bundled-content bootstrap refused because active claims already exist. This bootstrap refreshes source claims by replacement; use the version-aware import path or pass forceBootstrap only for a deliberate reset.",
      );
    }

    const topicsArr: any[] = Object.values(topicsJson)[0]?.default ?? [];
    const sources: any[] = Object.values(sourceJsons).map((m) => m.default);
    const blogs: any[] = Object.values(blogJsons).map((m) => m.default);
    const diagrams: any[] = Object.values(diagramAssets)[0]?.default ?? [];
    const summary = {
      forceBootstrap: !!data.forceBootstrap,
      existingActiveClaims: activeClaimCount ?? 0,
      sourceClaimsDeleted: 0,
      claimsInserted: 0,
      sourceRowsUpserted: 0,
      blogRowsUpserted: 0,
      designRowsUpserted: 0,
      topicRowsUpserted: 0,
      diagramRowsUpserted: 0,
      helpRowsUpserted: 0,
    };

    // 1) Capabilities (derived from topics + claims)
    const capIds = new Set<string>();
    for (const t of topicsArr) (t.capability_ids ?? []).forEach((id: string) => capIds.add(id));
    for (const s of sources)
      (s.claims ?? []).forEach((c: any) => c.capability_id && capIds.add(c.capability_id));
    const capRows = [...capIds].map((id) => ({
      id,
      name: CAPABILITY_NAMES[id]?.name ?? id,
      accent: CAPABILITY_NAMES[id]?.accent ?? "teal",
      description: "",
    }));
    if (capRows.length)
      await supabaseAdmin.from("capabilities").upsert(capRows, { onConflict: "id" });

    // 2) Topics (parents first)
    const ordered = [...topicsArr].sort(
      (a, b) => (a.parent_slug ? 1 : 0) - (b.parent_slug ? 1 : 0),
    );
    for (const t of ordered) {
      await supabaseAdmin.from("topics").upsert(
        {
          slug: t.slug,
          parent_slug: t.parent_slug ?? null,
          name: t.name,
          description: t.description ?? "",
          sort_order: t.order ?? 0,
        },
        { onConflict: "slug" },
      );
      summary.topicRowsUpserted++;
    }

    // 3) Topic ↔ Capability links
    await supabaseAdmin.from("topic_capabilities").delete().neq("topic_slug", "__never__");
    const tcRows: { topic_slug: string; capability_id: string }[] = [];
    for (const t of topicsArr) {
      for (const id of t.capability_ids ?? [])
        tcRows.push({ topic_slug: t.slug, capability_id: id });
    }
    if (tcRows.length) await supabaseAdmin.from("topic_capabilities").upsert(tcRows);

    // 4) Sources + Claims.
    // Non-destructive replay: upsert each source by slug (the family identity), then refresh
    // ONLY that source's claims. We never blanket-delete claims/blogs, so curated status/version
    // the backend owns on other rows survives. The backend (import_content.py against Supabase)
    // remains the canonical, version-aware path — see the banner comment at the top of this file.
    const slugById = new Map<string, string>();
    for (const [path, mod] of Object.entries(sourceJsons)) {
      const s = (mod as any).default;
      const slug = path.split("/").pop()!.replace(".json", "");
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
      slugById.set(slug, ins.id);
      // Non-destructive refresh: delete ONLY this source's pending claims so verified /
      // rejected / superseded curation persists across re-seeds and redeploys.
      summary.sourceRowsUpserted++;
      const { count: deleted } = await supabaseAdmin
        .from("claims")
        .delete({ count: "exact" })
        .eq("source_id", ins.id)
        .eq("status", "pending");
      summary.sourceClaimsDeleted += deleted ?? 0;
      // Dedup: skip incoming rows whose (capability_id, normalized text) already exist as a
      // non-pending (curated) claim on this source.
      const { data: kept } = await supabaseAdmin
        .from("claims")
        .select("capability_id, text")
        .eq("source_id", ins.id)
        .neq("status", "pending");
      const norm = (t: string) => (t ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      const keptKeys = new Set(
        (kept ?? []).map((c: any) => `${c.capability_id}::${norm(c.text)}`),
      );
      const claimRows = (s.claims ?? [])
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
      if (claimRows.length) {
        await supabaseAdmin.from("claims").insert(claimRows);
        summary.claimsInserted += claimRows.length;
      }
    }

    // Upsert-by-(kind,slug) helper. content_items only has a PARTIAL unique index on
    // (kind, slug) WHERE active, which a plain upsert({onConflict}) call can't target (no WHERE
    // clause support there) — find the active row manually and update in place, or insert a
    // fresh v1 row. Full-reset replay, not the versioned single-item publish path.
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

    // 5) Articles + citations (kind='article')
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
      const bsRows = keys
        .map((k, i) => {
          const sid = slugById.get(k);
          return sid
            ? { content_item_id: ins.id, source_id: sid, label: `S${i + 1}`, position: i }
            : null;
        })
        .filter(Boolean) as any[];
      if (bsRows.length) await supabaseAdmin.from("content_item_sources").insert(bsRows);
    }

    // 5b) Designs + citations (kind='design'). Un-empties the Designer section.
    let designCount = 0;
    for (const [path, mod] of Object.entries(designJsons)) {
      const d = (mod as any).default;
      const slug = d.slug ?? path.split("/").pop()!.replace(".json", "");
      const ins = await upsertContentItem({
        kind: "design",
        slug,
        topic_slug: d.topic_slug ?? null,
        title: d.title ?? slug,
        summary: d.summary ?? "",
        body_md: d.body_md ?? "",
        status: "published",
      });
      designCount++;
      summary.designRowsUpserted++;
      await supabaseAdmin.from("content_item_sources").delete().eq("content_item_id", ins.id);
      const keys: string[] = d.cited_source_keys ?? [];
      const dsRows = keys
        .map((k, i) => {
          const sid = slugById.get(k);
          return sid
            ? { content_item_id: ins.id, source_id: sid, label: `S${i + 1}`, position: i }
            : null;
        })
        .filter(Boolean) as any[];
      if (dsRows.length) await supabaseAdmin.from("content_item_sources").insert(dsRows);
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

    // 7) Help docs
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

    return {
      ok: true,
      mode: "bundled-content-bootstrap",
      summary,
      counts: {
        topics: topicsArr.length,
        capabilities: capRows.length,
        sources: Object.keys(sourceJsons).length,
        blogs: blogs.length,
        designs: designCount,
        diagrams: diagRows.length,
        help: helpRows.length,
      },
    };
  });
