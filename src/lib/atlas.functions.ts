import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { bundledContent } from "@/lib/bundled-content";

// Public reads use the anon/publishable key (RLS allows public SELECT on KB tables).
// This avoids needing the service-role key at runtime.
async function admin() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  if (!url || !key) throw new Error("Supabase public configuration is missing.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const listTopics = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    const { data, error } = await sb
      .from("topics")
      .select("slug,parent_slug,name,description,sort_order")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data?.length ? data : bundledContent.topics();
  } catch {
    return bundledContent.topics();
  }
});

export const listCapabilities = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    const { data, error } = await sb
      .from("capabilities")
      .select("id,name,description,accent,maturity,released_at");
    if (error) throw new Error(error.message);
    return data?.length ? data : bundledContent.capabilities();
  } catch {
    return bundledContent.capabilities();
  }
});

export const getTopic = createServerFn({ method: "GET" })
  .validator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    try {
      const sb = await admin();
      const [{ data: topic }, { data: children }, { data: caps }] = await Promise.all([
        sb.from("topics").select("*").eq("slug", data.slug).maybeSingle(),
        sb
          .from("topics")
          .select("slug,name,description,sort_order")
          .eq("parent_slug", data.slug)
          .order("sort_order"),
        sb
          .from("topic_capabilities")
          .select("capability_id, capabilities(id,name,description,accent,maturity)")
          .eq("topic_slug", data.slug),
      ]);
      if (topic) {
        const capabilityIds = (caps ?? []).map((row: any) => row.capability_id);
        // Articles/designs are topic-scoped directly; lessons are capability-scoped, so "lessons
        // for this topic" resolves via the topic's mapped capabilities (lessons have always been
        // organized capability-first, depth-second).
        const { data: content } = await sb
          .from("content_items")
          .select("kind,slug,title,summary,topic_slug,capability_id,depth_levels,updated_at")
          .eq("status", "published")
          .eq("active", true)
          .or(
            [
              `topic_slug.eq.${data.slug}`,
              capabilityIds.length ? `capability_id.in.(${capabilityIds.join(",")})` : "",
            ]
              .filter(Boolean)
              .join(","),
          )
          .order("updated_at", { ascending: false });
        return {
          topic,
          children: children ?? [],
          capabilities: (caps ?? []).map((c: any) => c.capabilities).filter(Boolean),
          items: content?.length ? content : [],
          // Deprecated alias kept for one release so any not-yet-migrated caller of getTopic()
          // still finds "blogs" — points at the same content, filtered to kind=article.
          blogs: content?.length
            ? content.filter((c: any) => c.kind === "article")
            : (bundledContent.topic(data.slug)?.blogs ?? []),
        };
      }
    } catch {
      // Fall through to bundled content.
    }
    const fallback = bundledContent.topic(data.slug);
    if (!fallback) throw new Error("Topic not found");
    return fallback;
  });

/**
 * Cheap freshness stamp for all reader-facing content.
 *
 * Derived (no new table), so it also moves when content is published out-of-band
 * (scripts/import_content.py, direct migrations) — not just via the in-app publisher.
 * Two aggregate queries, no body columns: safe to poll from every open tab.
 */
export const getContentVersion = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    const [items, diagrams] = await Promise.all([
      sb
        .from("content_items")
        .select("updated_at", { count: "exact" })
        .eq("status", "published")
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1),
      sb
        .from("diagrams")
        .select("created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    if (items.error) throw new Error(items.error.message);
    return {
      stamp: buildContentStamp(items, {
        data: (diagrams.data ?? []).map((d) => ({ updated_at: d.created_at })),
        count: diagrams.count,
      }),
      ok: true as const,
    };
  } catch {
    // Offline / bundled-content fallback: return a neutral stamp so the client keeps
    // whatever it already had instead of thrashing its caches.
    return { stamp: "", ok: false as const };
  }
});

type StampPart = { data?: { updated_at?: string | null }[] | null; count?: number | null };

export function buildContentStamp(items: StampPart, diagrams: StampPart): string {
  const at = (p: StampPart) => p.data?.[0]?.updated_at ?? "0";
  const n = (p: StampPart) => p.count ?? 0;
  return `${at(items)}:${n(items)}|${at(diagrams)}:${n(diagrams)}`;
}

export const getContentItem = createServerFn({ method: "GET" })
  .validator((d: { kind: "article" | "design" | "lesson"; slug: string }) => d)
  .handler(async ({ data }) => {
    try {
      const sb = await admin();
      const { data: item, error } = await sb
        .from("content_items")
        .select("*")
        .eq("kind", data.kind)
        .eq("slug", data.slug)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (item) {
        const [{ data: cites }, { data: caps }, { data: diagrams }] = await Promise.all([
          sb
            .from("content_item_sources")
            .select("label,position,sources(id,slug,url,title,tier,tags,summary)")
            .eq("content_item_id", item.id)
            .order("position"),
          item.topic_slug
            ? sb
                .from("topic_capabilities")
                .select("capabilities(id,name,maturity)")
                .eq("topic_slug", item.topic_slug)
            : Promise.resolve({ data: [] as any[] }),
          item.topic_slug
            ? sb.from("diagrams").select("slug,path,caption,kind").eq("topic_slug", item.topic_slug)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        return {
          item,
          citations: (cites ?? []).map((c: any) => ({ label: c.label, source: c.sources })),
          capabilities: (caps ?? []).map((c: any) => c.capabilities).filter(Boolean),
          diagrams: diagrams ?? [],
        };
      }
    } catch {
      // Fall through to bundled content -- each kind has its own bundled accessor with a
      // slightly different field set (design carries scenario, lesson carries lesson_meta,
      // neither carries the other's fields), so branch per kind rather than one generic call.
    }
    const fallback =
      data.kind === "article"
        ? bundledContent.blog(data.slug)
        : data.kind === "design"
          ? bundledContent.design(data.slug)
          : bundledContent.lesson(data.slug);
    if (fallback) {
      const item =
        "blog" in fallback
          ? fallback.blog
          : "design" in fallback
            ? fallback.design
            : fallback.lesson;
      return {
        item: { ...item, kind: data.kind },
        citations: fallback.citations,
        capabilities: [] as any[],
        diagrams: [] as any[],
      };
    }
    throw new Error(`${data.kind} not found`);
  });

export const getContentSiblings = createServerFn({ method: "GET" })
  .validator((d: { kind: "article" | "design" | "lesson"; slug: string; pathSlug?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const sb = await admin();
      const { resolveContentSiblings } = await import("@/lib/content-siblings.services.server");
      return await resolveContentSiblings(sb, data.kind, data.slug, data.pathSlug);
    } catch {
      return { pathSlug: null, pathTitle: null, prev: null, next: null };
    }
  });

export const listContentItems = createServerFn({ method: "GET" })
  .validator(
    (d: {
      kind?: "article" | "design" | "lesson";
      topicSlug?: string;
      capabilityId?: string;
      limit?: number;
    }) => d,
  )
  .handler(async ({ data }) => {
    try {
      const sb = await admin();
      // presentation_profile/lesson_meta/scenario added for Phase 6's list-view card variation
      // (archetype tags, featured-diagram thumbnails, lesson estimated time/objectives, design
      // scenario subtext) -- all additive/existing columns, safe for every existing caller since
      // none enumerate the whole row.
      let q = sb
        .from("content_items")
        .select(
          "id,kind,slug,title,summary,scenario,topic_slug,capability_id,depth_levels,tags,updated_at,presentation_profile,lesson_meta",
        )
        .eq("status", "published")
        .eq("active", true)
        .order("updated_at", { ascending: false });
      if (data.kind) q = q.eq("kind", data.kind);
      if (data.topicSlug) q = q.eq("topic_slug", data.topicSlug);
      if (data.capabilityId) q = q.eq("capability_id", data.capabilityId);
      if (data.limit && data.limit > 0) q = q.limit(data.limit);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      if (rows?.length) return rows;
    } catch {
      // Fall through to bundled content, per kind.
    }
    const bundled =
      data.kind === "article"
        ? bundledContent.blogs()
        : data.kind === "design"
          ? bundledContent.designs()
          : data.kind === "lesson"
            ? bundledContent.lessons()
            : [...bundledContent.blogs(), ...bundledContent.designs(), ...bundledContent.lessons()];
    return data.limit && data.limit > 0 ? bundled.slice(0, data.limit) : bundled;
  });

export const listLessons = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    const { data, error } = await sb
      .from("content_items")
      .select("id,slug,title,depth_levels,capability_id")
      .eq("kind", "lesson")
      .eq("active", true)
      .order("title");
    if (error) throw new Error(error.message);
    return data ?? [];
  } catch {
    return [];
  }
});

export type LearningPathItem = {
  content_kind: "article" | "design" | "lesson";
  content_slug: string;
  position: number;
  optional: boolean;
  title: string;
  summary: string;
  depth_levels: number[];
  lesson_meta: import("@/lib/content-presentation").LessonMeta | null;
  prerequisite_ids: string[];
};

export type LearningPath = {
  slug: string;
  title: string;
  description: string;
  audience: string;
  sort_order: number;
  items: LearningPathItem[];
};

// Powers /learn (WP1.4, docs/plan/phase-1-curriculum.md). Every path's items joined against
// content_items in one extra query (batched by slug, not N+1) so the page can render titles,
// summaries, and lesson_meta without a second round-trip per item.
export const listLearningPaths = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    const [{ data: paths, error: pathsError }, { data: items, error: itemsError }] =
      await Promise.all([
        sb
          .from("learning_paths")
          .select("slug,title,description,audience,sort_order")
          .eq("active", true)
          .order("sort_order"),
        sb
          .from("path_items")
          .select("path_slug,content_kind,content_slug,position,optional")
          .order("position"),
      ]);
    if (pathsError) throw new Error(pathsError.message);
    if (itemsError) throw new Error(itemsError.message);
    if (!paths?.length) return [] as LearningPath[];

    const allSlugs = [...new Set((items ?? []).map((i) => i.content_slug))];
    const { data: contentRows } = allSlugs.length
      ? await sb
          .from("content_items")
          .select("slug,title,summary,depth_levels,lesson_meta,prerequisite_ids")
          .in("slug", allSlugs)
          .eq("active", true)
          .eq("status", "published")
      : { data: [] };
    const contentBySlug = new Map((contentRows ?? []).map((r) => [r.slug, r]));

    const itemsByPath = new Map<string, LearningPathItem[]>();
    for (const item of items ?? []) {
      const content = contentBySlug.get(item.content_slug);
      if (!content) continue; // item references unpublished/missing content — skip rather than render a broken row
      const list = itemsByPath.get(item.path_slug) ?? [];
      list.push({
        content_kind: item.content_kind as LearningPathItem["content_kind"],
        content_slug: item.content_slug,
        position: item.position,
        optional: item.optional,
        title: content.title,
        summary: content.summary ?? "",
        depth_levels: content.depth_levels ?? [],
        lesson_meta: (content.lesson_meta as LearningPathItem["lesson_meta"]) ?? null,
        prerequisite_ids: content.prerequisite_ids ?? [],
      });
      itemsByPath.set(item.path_slug, list);
    }

    return paths.map((p) => ({
      ...p,
      items: (itemsByPath.get(p.slug) ?? []).sort((a, b) => a.position - b.position),
    })) as LearningPath[];
  } catch {
    return [] as LearningPath[];
  }
});

export const listClaimsByCapability = createServerFn({ method: "GET" })
  .validator(
    (d: { capabilityId?: string; limit?: number; depth?: number; tier?: number; q?: string }) => d,
  )
  .handler(async ({ data }) => {
    const limit = Math.min(Math.max(data.limit ?? 500, 1), 500);
    try {
      const sb = await admin();
      // A tier filter must use an inner join — `.eq("sources.tier", …)` on a plain embed only
      // nulls the embedded source and still returns every claim row (a silent no-op filter).
      const sourceJoin = data.tier
        ? "sources!inner(slug,url,title,tier)"
        : "sources(slug,url,title,tier)";
      let q = sb
        .from("claims")
        // Cast keeps the statically-inferred row type; `!inner` only changes join semantics.
        .select(
          `id,text,depth,type,tags,capability_id,${sourceJoin}` as "id,text,depth,type,tags,capability_id,sources(slug,url,title,tier)",
        )
        .eq("active", true)
        .order("depth");
      if (data.capabilityId) q = q.eq("capability_id", data.capabilityId);
      if (data.depth) q = q.eq("depth", data.depth);
      if (data.tier) q = q.eq("sources.tier", data.tier);
      if (data.q?.trim()) q = q.ilike("text", `%${data.q.trim()}%`);
      const { data: rows, error } = await q.limit(limit);
      if (error) throw new Error(error.message);
      if (rows?.length) return rows;
    } catch {
      // Fall through to bundled content.
    }
    const term = data.q?.trim().toLowerCase() ?? "";
    return bundledContent
      .claims()
      .filter((claim) => !data.capabilityId || claim.capability_id === data.capabilityId)
      .filter((claim) => !data.depth || claim.depth === data.depth)
      .filter((claim: any) => !data.tier || claim.sources?.tier === data.tier)
      .filter(
        (claim) => !term || `${claim.text} ${claim.tags?.join(" ")}`.toLowerCase().includes(term),
      )
      .slice(0, limit);
  });

export const listClaimCountsByCapability = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    const { data, error } = await sb.from("claims").select("capability_id").eq("active", true);
    if (error) throw new Error(error.message);
    if (data?.length) {
      return data.reduce<Record<string, number>>((acc, row) => {
        acc[row.capability_id] = (acc[row.capability_id] ?? 0) + 1;
        return acc;
      }, {});
    }
  } catch {
    // Fall through to bundled content.
  }
  return bundledContent.claims().reduce<Record<string, number>>((acc, claim) => {
    acc[claim.capability_id] = (acc[claim.capability_id] ?? 0) + 1;
    return acc;
  }, {});
});

export type RegistryCoverageRow = {
  id: string;
  name: string;
  description: string | null;
  accent: string;
  maturity: string;
  claim_count: number;
  verified_count: number;
  depth_coverage: Record<1 | 2 | 3 | 4 | 5, number>;
  blog_count: number;
  diagram_count: number;
};

// Live coverage for the registry dashboard: per capability, how much grounded knowledge,
// how deep, and whether it has published reading + diagrams. One read of the public KB tables;
// aggregation happens in-process (small tables, public RLS).
export const getRegistryCoverage = createServerFn({ method: "GET" }).handler(
  async (): Promise<RegistryCoverageRow[]> => {
    const emptyDepth = () =>
      ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }) as Record<1 | 2 | 3 | 4 | 5, number>;
    try {
      const sb = await admin();
      const [
        { data: caps, error: capErr },
        { data: claims },
        { data: topicCaps },
        { data: blogs },
        { data: diagrams },
      ] = await Promise.all([
        sb.from("capabilities").select("id,name,description,accent,maturity"),
        sb.from("claims").select("capability_id,depth,status").eq("active", true),
        sb.from("topic_capabilities").select("topic_slug,capability_id"),
        sb
          .from("content_items")
          .select("topic_slug")
          .eq("kind", "article")
          .eq("status", "published"),
        sb.from("diagrams").select("topic_slug"),
      ]);
      if (capErr) throw new Error(capErr.message);
      if (!caps?.length) throw new Error("No capabilities");

      // capability_id -> set of topic_slugs, so blogs/diagrams (keyed by topic) roll up to caps.
      const capTopics = new Map<string, Set<string>>();
      for (const tc of topicCaps ?? []) {
        if (!tc.topic_slug) continue;
        const set = capTopics.get(tc.capability_id) ?? new Set<string>();
        set.add(tc.topic_slug);
        capTopics.set(tc.capability_id, set);
      }
      const blogsByTopic = new Map<string, number>();
      for (const b of blogs ?? [])
        if (b.topic_slug) blogsByTopic.set(b.topic_slug, (blogsByTopic.get(b.topic_slug) ?? 0) + 1);
      const diagramsByTopic = new Map<string, number>();
      for (const d of diagrams ?? [])
        if (d.topic_slug)
          diagramsByTopic.set(d.topic_slug, (diagramsByTopic.get(d.topic_slug) ?? 0) + 1);

      return caps.map((c: any) => {
        const capClaims = (claims ?? []).filter((cl) => cl.capability_id === c.id);
        const depth_coverage = emptyDepth();
        for (const cl of capClaims) {
          const d = cl.depth as 1 | 2 | 3 | 4 | 5;
          if (d >= 1 && d <= 5) depth_coverage[d] += 1;
        }
        const topics = capTopics.get(c.id) ?? new Set<string>();
        let blog_count = 0;
        let diagram_count = 0;
        for (const slug of topics) {
          blog_count += blogsByTopic.get(slug) ?? 0;
          diagram_count += diagramsByTopic.get(slug) ?? 0;
        }
        return {
          id: c.id,
          name: c.name,
          description: c.description,
          accent: c.accent,
          maturity: c.maturity ?? "ga",
          claim_count: capClaims.length,
          verified_count: capClaims.filter((cl) => cl.status === "verified").length,
          depth_coverage,
          blog_count,
          diagram_count,
        };
      });
    } catch {
      // Fall through to bundled content — no live coverage, but the page still renders.
      const counts = bundledContent.claims().reduce<Record<string, any[]>>((acc, claim) => {
        (acc[claim.capability_id] ??= []).push(claim);
        return acc;
      }, {});
      return bundledContent.capabilities().map((c: any) => {
        const capClaims = counts[c.id] ?? [];
        const depth_coverage = emptyDepth();
        for (const cl of capClaims) {
          const d = cl.depth as 1 | 2 | 3 | 4 | 5;
          if (d >= 1 && d <= 5) depth_coverage[d] += 1;
        }
        return {
          id: c.id,
          name: c.name,
          description: c.description ?? null,
          accent: c.accent ?? "teal",
          maturity: c.maturity ?? "ga",
          claim_count: capClaims.length,
          verified_count: 0,
          depth_coverage,
          blog_count: 0,
          diagram_count: 0,
        };
      });
    }
  },
);

export const listSources = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    const { data, error } = await sb
      .from("sources")
      .select("id,slug,url,title,tier,tags,summary")
      .order("tier")
      .order("title");
    if (error) throw new Error(error.message);
    return data?.length ? data : bundledContent.sources();
  } catch {
    return bundledContent.sources();
  }
});

export type RoadmapItem = {
  id: string;
  guid: string;
  release_item_id: string | null;
  title: string;
  feature_name: string;
  link: string;
  status: string;
  release_type: string;
  release_status: string;
  target_release: string;
  release_date: string | null;
  product_id: string | null;
  product_name: string;
  feature_description: string | null;
  blog_title: string | null;
  blog_url: string | null;
  last_modified: string | null;
  active: boolean;
  categories: string[];
  description_html: string;
  pub_date: string | null;
  capability_id: string | null;
};

// Roadmap items are synced from the Fabric GPS community API (see pollFabricRoadmap). The rows
// remain separate from claims; only canonical blog URLs enter the curator queue. There is no
// bundled-content fallback here, so an empty list means nobody has synced yet.
export const listRoadmapItems = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    // roadmap_items isn't in the generated Database type yet (regenerate after applying the
    // migration); `as any` here matches the same escape hatch used for search_atlas below.
    const { data, error } = await (sb as any)
      .from("roadmap_items")
      .select(
        "id,guid,release_item_id,title,feature_name,link,status,release_type,release_status,target_release,release_date,product_id,product_name,feature_description,blog_title,blog_url,last_modified,active,categories,description_html,pub_date,capability_id",
      )
      .eq("active", true)
      .order("pub_date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as RoadmapItem[];
  } catch {
    return [] as RoadmapItem[];
  }
});

export const listDiagrams = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    const { data, error } = await sb.from("diagrams").select("slug,path,caption,kind,topic_slug");
    if (error) throw new Error(error.message);
    return data?.length ? data : bundledContent.diagrams();
  } catch {
    return bundledContent.diagrams();
  }
});

export const listHelp = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    const { data, error } = await sb.from("help_docs").select("*").order("sort_order");
    if (error) throw new Error(error.message);
    return data?.length ? data : bundledContent.help();
  } catch {
    return bundledContent.help();
  }
});

export const searchAll = createServerFn({ method: "GET" })
  .validator((d: { q: string }) => d)
  .handler(async ({ data }) => {
    const term = data.q.trim();
    if (!term) return { blogs: [], claims: [], sources: [], topics: [] };
    try {
      const sb = await admin();
      const { data: rows, error } = await (sb as any).rpc("search_atlas", {
        term,
        max_results: 20,
      });
      if (error) throw new Error(error.message);
      const result = {
        blogs: [] as any[],
        claims: [] as any[],
        sources: [] as any[],
        topics: [] as any[],
      };
      for (const row of rows ?? []) {
        // search_atlas now returns kind = 'article' | 'design' | 'lesson' | 'claim' | 'source' | 'topic'.
        if (row.kind === "article" || row.kind === "design" || row.kind === "lesson") {
          // Carry the kind on the payload — the search page needs it to link to
          // /blogs/$kind/$slug (designs/lessons 404 on the article-only route).
          result.blogs.push({ ...row.payload, kind: row.kind });
        }
        if (row.kind === "claim") result.claims.push(row.payload);
        if (row.kind === "source") result.sources.push(row.payload);
        if (row.kind === "topic") result.topics.push(row.payload);
      }
      if (Object.values(result).some((rows) => rows.length > 0)) return result;
    } catch {
      // Fall through to bundled search.
    }
    const q = term.toLowerCase();
    return {
      blogs: bundledContent
        .blogs()
        .filter((blog) => `${blog.title} ${blog.summary} ${blog.body_md}`.toLowerCase().includes(q))
        .slice(0, 15)
        .map((blog) => ({ ...blog, kind: "article" as const })),
      claims: bundledContent
        .claims()
        .filter((claim) => `${claim.text} ${claim.capability_id}`.toLowerCase().includes(q))
        .slice(0, 20),
      sources: bundledContent
        .sources()
        .filter((source) => `${source.title} ${source.summary}`.toLowerCase().includes(q))
        .slice(0, 15),
      topics: bundledContent
        .topics()
        .filter((topic) => `${topic.name} ${topic.description}`.toLowerCase().includes(q))
        .slice(0, 10),
    };
  });

// Favorites
export const listMyFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("favorites")
      .select("item_type,item_key,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      itemType:
        "blog" | "article" | "design" | "lesson" | "topic" | "capability" | "source" | "claim";
      itemKey: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("favorites")
      .select("item_key")
      .eq("user_id", userId)
      .eq("item_type", data.itemType)
      .eq("item_key", data.itemKey)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("item_type", data.itemType)
        .eq("item_key", data.itemKey);
      if (error) throw new Error(error.message);
      return { favorited: false };
    }
    const { error } = await supabase
      .from("favorites")
      .insert({ user_id: userId, item_type: data.itemType, item_key: data.itemKey });
    if (error) throw new Error(error.message);
    return { favorited: true };
  });

// Server-side learner progress (Phase 1 / WP1.2). Anonymous reading is untouched — these three
// functions are only ever called once signed in; anonymous progress stays entirely in
// localStorage via the existing use-lesson-progress/use-reading-progress/use-step-progress hooks.
// See src/lib/use-progress-sync.ts for the client-side merge-on-sign-in + offline queue that
// drives these, and src/lib/progress.services.server.ts for the unit-testable merge logic.
export type { ProgressRow } from "@/lib/progress.services.server";

export const listMyProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_progress")
      .select("content_kind,content_slug,status,percent,completed_at,updated_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as import("@/lib/progress.services.server").ProgressRow[];
  });

// Single-item upsert used by the normal in-app "mark complete" / reading-progress writes. Never
// downgrades: if the existing server row is already further along (higher percent, or already
// completed) than this write, the write is dropped rather than regressing the row — the same
// never-downgrade rule the merge-on-sign-in path uses, applied uniformly so a slow duplicate
// request can't undo a later one.
export const upsertMyProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      contentKind: "article" | "design" | "lesson";
      contentSlug: string;
      status: "in_progress" | "completed";
      percent: number;
      completedAt?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isRegression } = await import("@/lib/progress.services.server");
    const { data: existing } = await supabase
      .from("user_progress")
      .select("status,percent,completed_at")
      .eq("user_id", userId)
      .eq("content_kind", data.contentKind)
      .eq("content_slug", data.contentSlug)
      .maybeSingle();

    if (
      existing &&
      isRegression(existing as import("@/lib/progress.services.server").ExistingProgress, data)
    ) {
      return { ok: true, skipped: true };
    }

    const { error } = await supabase.from("user_progress").upsert(
      {
        user_id: userId,
        content_kind: data.contentKind,
        content_slug: data.contentSlug,
        status: data.status,
        percent: data.percent,
        completed_at:
          data.completedAt ?? (data.status === "completed" ? new Date().toISOString() : null),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,content_kind,content_slug" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, skipped: false };
  });

// One-shot bulk merge run once per device on first authenticated load (see use-progress-sync.ts's
// fa:merged-at stamp), folding the anonymous localStorage state into the server. Union + max (see
// progress.services.server.ts's mergeLocalRows) — this table only ever moves forward from a
// merge, never backward, so a completed lesson can't un-complete because a different device's
// localStorage was thinner.
export const mergeLocalProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { rows: import("@/lib/progress.services.server").ProgressRow[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.rows.length) return { merged: 0 };
    const { mergeLocalRows } = await import("@/lib/progress.services.server");

    const { data: existingRows } = await supabase
      .from("user_progress")
      .select("content_kind,content_slug,status,percent,completed_at");
    const existingByKey = new Map(
      (existingRows ?? []).map((r) => [
        `${r.content_kind}:${r.content_slug}`,
        r as import("@/lib/progress.services.server").ExistingProgress,
      ]),
    );

    const merged = mergeLocalRows(data.rows, existingByKey, new Date().toISOString());
    const toUpsert = merged.map((row) => ({ ...row, user_id: userId }));

    const { error } = await supabase
      .from("user_progress")
      .upsert(toUpsert, { onConflict: "user_id,content_kind,content_slug" });
    if (error) throw new Error(error.message);
    return { merged: toUpsert.length };
  });

export type ContentFeedbackCategory =
  "factual_error" | "outdated" | "unclear" | "broken_link" | "missing_citation" | "other";

const FEEDBACK_RATE_LIMIT = 5; // max submissions per (content item, identity) per rolling hour

// Resolves the caller's identity WITHOUT requiring profiles.status === 'approved' — that gate
// (enforced by the generated requireSupabaseAuth middleware, which this endpoint deliberately
// does not use) is the right access boundary for the rest of the app, but "report an issue" is
// meant to be open to any reader, logged in or not. If a Bearer token is present, it's resolved
// to a real auth.uid() (still validated — a garbage/expired token is rejected, not silently
// treated as anonymous); otherwise the caller must be anonymous.
async function resolveFeedbackIdentity(): Promise<{
  userId: string | null;
  supabase: ReturnType<typeof createClient<Database>>;
}> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    // No token at all — anonymous caller. Use a plain anon-key client so the `anon` role's RLS
    // insert policy governs the write (see the content_feedback_anonymous migration).
    return { userId: null, supabase: createClient<Database>(url, key) };
  }
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Error("Unauthorized: Invalid token");
  }
  return { userId: data.claims.sub, supabase };
}

async function logFeedbackEvent(
  action: "feedback.rate_limited" | "feedback.submitted_anonymous",
  metadata: Record<string, unknown>,
) {
  // Both events need the real service-role client — admin_audit_events grants INSERT only to
  // service_role (not authenticated, not anon), unlike content_feedback itself. Best-effort:
  // a logging failure must never mask the real outcome of the submission.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_events").insert({
      actor_id: null,
      action,
      target_type: "content_feedback",
      target_id: "",
      metadata: metadata as never,
    });
  } catch {
    // Swallow — see comment above.
  }
}

// Reader-submitted feedback on a content item. content_hash is captured server-side from the
// live row, never trusted from the client, so triage can later tell if the article already
// changed since this was filed. Open to any reader — logged in or fully anonymous (anonToken) —
// not gated on profiles.status='approved' like the rest of the app; a server-side rate limit is
// the replacement spam control, and every rate-limit rejection and anonymous submission is logged
// so an admin can see the effect of that widened access in Settings -> Logs, not just in theory.
export const submitContentFeedback = createServerFn({ method: "POST" })
  .validator(
    (d: {
      contentItemId: string;
      category: ContentFeedbackCategory;
      body: string;
      sectionId?: string;
      sectionTitle?: string;
      anonToken?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    const body = data.body.trim();
    if (!body) throw new Error("Feedback text is required.");
    if (body.length > 4000) throw new Error("Feedback is too long (4000 characters max).");

    const { userId, supabase } = await resolveFeedbackIdentity();
    const anonToken = data.anonToken?.trim().slice(0, 100) || null;
    if (!userId && !anonToken) {
      throw new Error("Sign in, or wait a moment for feedback to initialize, to report an issue.");
    }

    const sb = await admin();
    const { data: item, error: itemError } = await sb
      .from("content_items")
      .select("content_hash")
      .eq("id", data.contentItemId)
      .maybeSingle();
    if (itemError) throw new Error(itemError.message);
    if (!item) throw new Error("Content item not found.");

    const identityLabel = userId ?? `anon:${anonToken}`;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const feedbackTable = supabase.from("content_feedback") as any;
    let recentCountQuery = feedbackTable
      .select("id", { count: "exact", head: true })
      .eq("content_item_id", data.contentItemId)
      .gte("created_at", oneHourAgo);
    recentCountQuery = userId
      ? recentCountQuery.eq("submitted_by", userId)
      : recentCountQuery.eq("submitted_by_anon_token", anonToken as string);
    const { count: recentCount } = await recentCountQuery;
    if ((recentCount ?? 0) >= FEEDBACK_RATE_LIMIT) {
      await logFeedbackEvent("feedback.rate_limited", {
        content_item_id: data.contentItemId,
        identity: identityLabel,
        count_last_hour: recentCount ?? 0,
      });
      throw new Error("Please wait before submitting more feedback on this article.");
    }

    const { error } = await feedbackTable.insert({
      content_item_id: data.contentItemId,
      content_hash: item.content_hash,
      submitted_by: userId,
      submitted_by_anon_token: userId ? null : anonToken,
      category: data.category,
      body,
      section_id: data.sectionId ?? null,
      section_title: data.sectionTitle ?? null,
    });
    if (error) throw new Error(error.message);

    if (!userId) {
      await logFeedbackEvent("feedback.submitted_anonymous", {
        content_item_id: data.contentItemId,
        section_id: data.sectionId ?? null,
        category: data.category,
        anon_token: anonToken,
      });
    }
    return { ok: true as const };
  });

// "Did I already report this section" for the current identity on one content item. This is a
// non-critical reader convenience, so it must never require the service-role key: authenticated
// callers read through their own RLS-scoped session, while anonymous callers fall back to an empty
// list because anon tokens are not a verifiable database identity.
export const listMyContentFeedback = createServerFn({ method: "GET" })
  .validator((d: { contentItemId: string; anonToken?: string }) => d)
  .handler(async ({ data }) => {
    const { userId, supabase } = await resolveFeedbackIdentity();
    if (!userId) return [];

    const { data: rows, error } = await supabase
      .from("content_feedback")
      .select("section_id,category,status,created_at")
      .eq("content_item_id", data.contentItemId)
      .eq("submitted_by", userId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Admin: is current user an admin?
export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { admin: !!data };
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const sb = await admin();
    const tables = [
      "topics",
      "capabilities",
      "sources",
      "claims",
      "diagrams",
      "help_docs",
    ] as const;
    const kinds = ["article", "design", "lesson"] as const;
    const counts: Record<string, number> = {};
    // content_items replaces blogs/designs/lessons as separate counted tables — break it down by
    // kind so the admin dashboard doesn't lose the per-kind counts it used to show as "blogs".
    await Promise.all([
      ...tables.map(async (t) => {
        const { count } = await sb.from(t).select("*", { count: "exact", head: true });
        counts[t] = count ?? 0;
      }),
      ...kinds.map(async (kind) => {
        const { count } = await sb
          .from("content_items")
          .select("*", { count: "exact", head: true })
          .eq("kind", kind)
          .eq("active", true);
        counts[`${kind}s`] = count ?? 0;
      }),
    ]);
    counts.blogs = counts.articles; // deprecated alias kept for one release
    return counts;
  });
