import { createServerFn } from "@tanstack/react-start";
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
  .inputValidator((d: { slug: string }) => d)
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

export const getContentItem = createServerFn({ method: "GET" })
  .inputValidator((d: { kind: "article" | "design" | "lesson"; slug: string }) => d)
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
      // Fall through to bundled content (article kind only -- designs/lessons have no bundled fallback).
    }
    if (data.kind === "article") {
      const fallback = bundledContent.blog(data.slug);
      if (fallback) {
        return {
          item: { ...fallback.blog, kind: "article" as const },
          citations: fallback.citations,
          capabilities: [] as any[],
          diagrams: [] as any[],
        };
      }
    }
    throw new Error(`${data.kind} not found`);
  });

export const listContentItems = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { kind?: "article" | "design" | "lesson"; topicSlug?: string; capabilityId?: string }) => d,
  )
  .handler(async ({ data }) => {
    try {
      const sb = await admin();
      let q = sb
        .from("content_items")
        .select("id,kind,slug,title,summary,topic_slug,capability_id,depth_levels,tags,updated_at")
        .eq("status", "published")
        .eq("active", true)
        .order("updated_at", { ascending: false });
      if (data.kind) q = q.eq("kind", data.kind);
      if (data.topicSlug) q = q.eq("topic_slug", data.topicSlug);
      if (data.capabilityId) q = q.eq("capability_id", data.capabilityId);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      if (rows?.length) return rows;
    } catch {
      // Fall through to bundled content for articles only.
    }
    if (!data.kind || data.kind === "article") return bundledContent.blogs();
    return [];
  });

// Deprecated thin wrappers — kept for one release so call sites not yet migrated to
// getContentItem/listContentItems keep working. New code should call those directly.
export const getBlog = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    try {
      const sb = await admin();
      const { data: item, error } = await sb
        .from("content_items")
        .select("*")
        .eq("kind", "article")
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
          blog: item,
          citations: (cites ?? []).map((c: any) => ({ label: c.label, source: c.sources })),
          capabilities: (caps ?? []).map((c: any) => c.capabilities).filter(Boolean),
          diagrams: diagrams ?? [],
        };
      }
    } catch {
      // Fall through to bundled content.
    }
    const fallback = bundledContent.blog(data.slug);
    if (!fallback) throw new Error("Blog not found");
    return fallback;
  });

export const getDesign = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    try {
      const sb = await admin();
      const { data: item, error } = await sb
        .from("content_items")
        .select("*")
        .eq("kind", "design")
        .eq("slug", data.slug)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (item) {
        const { data: cites } = await sb
          .from("content_item_sources")
          .select("label,position,sources(id,slug,url,title,tier,tags,summary)")
          .eq("content_item_id", item.id)
          .order("position");
        return {
          design: item,
          citations: (cites ?? []).map((c: any) => ({ label: c.label, source: c.sources })),
        };
      }
    } catch {
      // Fall through to bundled content.
    }
    const fallback = bundledContent.design(data.slug);
    if (!fallback) throw new Error("Design not found");
    return fallback;
  });

export const listBlogs = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    const { data, error } = await sb
      .from("content_items")
      .select("slug,title,summary,topic_slug,updated_at")
      .eq("kind", "article")
      .eq("status", "published")
      .eq("active", true)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data?.length ? data : bundledContent.blogs();
  } catch {
    return bundledContent.blogs();
  }
});

export const listDesigns = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const sb = await admin();
    const { data, error } = await sb
      .from("content_items")
      .select("id,slug,title,summary,status,topic_slug,updated_at")
      .eq("kind", "design")
      .eq("active", true)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data?.length ? data : bundledContent.designs();
  } catch {
    return bundledContent.designs();
  }
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

export const listClaimsByCapability = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { capabilityId?: string; limit?: number; depth?: number; tier?: number; q?: string }) => d,
  )
  .handler(async ({ data }) => {
    const limit = Math.min(Math.max(data.limit ?? 500, 1), 500);
    try {
      const sb = await admin();
      let q = sb
        .from("claims")
        .select("id,text,depth,type,tags,capability_id,sources(slug,url,title,tier)")
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
        sb.from("content_items").select("topic_slug").eq("kind", "article").eq("status", "published"),
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
  .inputValidator((d: { q: string }) => d)
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
          result.blogs.push(row.payload);
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
        .slice(0, 15),
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
  .inputValidator(
    (d: { itemType: "blog" | "article" | "design" | "lesson" | "topic" | "source" | "claim"; itemKey: string }) =>
      d,
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
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const { count } = await sb.from(t).select("*", { count: "exact", head: true });
      counts[t] = count ?? 0;
    }
    // content_items replaces blogs/designs/lessons as separate counted tables — break it down by
    // kind so the admin dashboard doesn't lose the per-kind counts it used to show as "blogs".
    const { count: articleCount } = await sb
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("kind", "article")
      .eq("active", true);
    const { count: designCount } = await sb
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("kind", "design")
      .eq("active", true);
    const { count: lessonCount } = await sb
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("kind", "lesson")
      .eq("active", true);
    counts.blogs = articleCount ?? 0; // deprecated alias kept for one release
    counts.articles = articleCount ?? 0;
    counts.designs = designCount ?? 0;
    counts.lessons = lessonCount ?? 0;
    return counts;
  });
