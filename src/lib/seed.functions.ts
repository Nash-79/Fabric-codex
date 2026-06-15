import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Bundle the content/ JSON and markdown at build time.
const topicsJson = import.meta.glob("/content/topics.json", { eager: true }) as Record<string, { default: any }>;
const sourceJsons = import.meta.glob("/content/sources/*.json", { eager: true }) as Record<string, { default: any }>;
const blogJsons = import.meta.glob("/content/blogs/*.json", { eager: true }) as Record<string, { default: any }>;
const diagramAssets = import.meta.glob("/content/diagrams/assets.json", { eager: true }) as Record<string, { default: any }>;
const helpMd = import.meta.glob("/content/help/*.md", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;

const CAPABILITY_NAMES: Record<string, { name: string; accent: string }> = {
  "fabric-platform":   { name: "Fabric Platform",          accent: "indigo" },
  "capacity":          { name: "Capacity & Cost",          accent: "amber" },
  "purview":           { name: "Governance & Purview",     accent: "violet" },
  "onelake":           { name: "OneLake",                  accent: "teal" },
  "lakehouse":         { name: "Lakehouse",                accent: "teal" },
  "mirroring":         { name: "Mirroring",                accent: "teal" },
  "spark":             { name: "Spark",                    accent: "rose" },
  "data-factory":      { name: "Data Factory",             accent: "rose" },
  "dataflow-gen2":     { name: "Dataflow Gen2",            accent: "rose" },
  "warehouse":         { name: "Warehouse",                accent: "yellow" },
  "polaris":           { name: "Polaris SQL Engine",       accent: "yellow" },
  "sql-database":      { name: "SQL Database in Fabric",   accent: "yellow" },
  "direct-lake":       { name: "Direct Lake",              accent: "indigo" },
  "semantic-model":    { name: "Semantic Model",           accent: "indigo" },
  "power-bi":          { name: "Power BI",                 accent: "indigo" },
  "rti":               { name: "Real-Time Intelligence",   accent: "rose" },
  "eventhouse-kql":    { name: "Eventhouse / KQL",         accent: "rose" },
  "fabric-data-agent": { name: "Fabric Data Agent",        accent: "violet" },
  "fabric-iq":         { name: "Fabric IQ",                accent: "violet" },
  "graphql-api":       { name: "GraphQL API",              accent: "violet" },
};

export const seedFromContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const topicsArr: any[] = Object.values(topicsJson)[0]?.default ?? [];
    const sources: any[] = Object.values(sourceJsons).map((m) => m.default);
    const blogs: any[] = Object.values(blogJsons).map((m) => m.default);
    const diagrams: any[] = Object.values(diagramAssets)[0]?.default ?? [];

    // 1) Capabilities (derived from topics + claims)
    const capIds = new Set<string>();
    for (const t of topicsArr) (t.capability_ids ?? []).forEach((id: string) => capIds.add(id));
    for (const s of sources) (s.claims ?? []).forEach((c: any) => c.capability_id && capIds.add(c.capability_id));
    const capRows = [...capIds].map((id) => ({
      id,
      name: CAPABILITY_NAMES[id]?.name ?? id,
      accent: CAPABILITY_NAMES[id]?.accent ?? "teal",
      description: "",
    }));
    if (capRows.length) await supabaseAdmin.from("capabilities").upsert(capRows, { onConflict: "id" });

    // 2) Topics (parents first)
    const ordered = [...topicsArr].sort((a, b) => (a.parent_slug ? 1 : 0) - (b.parent_slug ? 1 : 0));
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
    }

    // 3) Topic ↔ Capability links
    await supabaseAdmin.from("topic_capabilities").delete().neq("topic_slug", "__never__");
    const tcRows: { topic_slug: string; capability_id: string }[] = [];
    for (const t of topicsArr) {
      for (const id of t.capability_ids ?? []) tcRows.push({ topic_slug: t.slug, capability_id: id });
    }
    if (tcRows.length) await supabaseAdmin.from("topic_capabilities").upsert(tcRows);

    // 4) Sources + Claims (replace existing for clean re-seed)
    await supabaseAdmin.from("claims").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("blog_sources").delete().neq("blog_id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("blogs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("sources").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    const slugById = new Map<string, string>();
    for (const [path, mod] of Object.entries(sourceJsons)) {
      const s = (mod as any).default;
      const slug = path.split("/").pop()!.replace(".json", "");
      const { data: ins, error } = await supabaseAdmin
        .from("sources")
        .insert({
          slug,
          url: s.url,
          title: s.title,
          tier: s.tier ?? 6,
          tags: s.tags ?? [],
          summary: s.summary ?? "",
        })
        .select("id")
        .single();
      if (error) throw new Error(`source ${slug}: ${error.message}`);
      slugById.set(slug, ins.id);
      const claimRows = (s.claims ?? [])
        .filter((c: any) => c.capability_id && capIds.has(c.capability_id))
        .map((c: any) => ({
          source_id: ins.id,
          capability_id: c.capability_id,
          text: c.text,
          depth: c.depth ?? 2,
          type: c.type ?? "fact",
          tags: c.tags ?? [],
        }));
      if (claimRows.length) await supabaseAdmin.from("claims").insert(claimRows);
    }

    // 5) Blogs + citations
    for (const b of blogs) {
      const { data: ins, error } = await supabaseAdmin
        .from("blogs")
        .insert({
          slug: b.slug,
          topic_slug: b.topic_slug ?? null,
          title: b.title,
          summary: b.summary ?? "",
          body_md: b.body_md ?? "",
          status: "published",
        })
        .select("id")
        .single();
      if (error) throw new Error(`blog ${b.slug}: ${error.message}`);
      const keys: string[] = b.cited_source_keys ?? [];
      const bsRows = keys
        .map((k, i) => {
          const sid = slugById.get(k);
          return sid ? { blog_id: ins.id, source_id: sid, label: `S${i + 1}`, position: i } : null;
        })
        .filter(Boolean) as any[];
      if (bsRows.length) await supabaseAdmin.from("blog_sources").insert(bsRows);
    }

    // 6) Diagrams
    await supabaseAdmin.from("diagrams").delete().neq("slug", "__never__");
    const diagRows = diagrams.map((d: any) => {
      const slug = d.path.split("/").pop().replace(/\.(svg|mmd)$/i, "");
      return {
        slug,
        path: `/diagrams/${slug}.svg`,
        caption: d.caption ?? "",
        kind: d.kind ?? "architecture",
        topic_slug: null,
      };
    });
    if (diagRows.length) await supabaseAdmin.from("diagrams").upsert(diagRows, { onConflict: "slug" });

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
    if (helpRows.length) await supabaseAdmin.from("help_docs").upsert(helpRows, { onConflict: "slug" });

    return {
      ok: true,
      counts: {
        topics: topicsArr.length,
        capabilities: capRows.length,
        sources: Object.keys(sourceJsons).length,
        blogs: blogs.length,
        diagrams: diagRows.length,
        help: helpRows.length,
      },
    };
  });
