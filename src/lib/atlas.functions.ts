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
    const { data, error } = await sb.from("capabilities").select("id,name,description,accent");
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
      const [{ data: topic }, { data: children }, { data: caps }, { data: blogs }] =
        await Promise.all([
          sb.from("topics").select("*").eq("slug", data.slug).maybeSingle(),
          sb
            .from("topics")
            .select("slug,name,description,sort_order")
            .eq("parent_slug", data.slug)
            .order("sort_order"),
          sb
            .from("topic_capabilities")
            .select("capability_id, capabilities(id,name,description,accent)")
            .eq("topic_slug", data.slug),
          sb
            .from("blogs")
            .select("slug,title,summary,updated_at")
            .eq("topic_slug", data.slug)
            .eq("status", "published")
            .order("updated_at", { ascending: false }),
        ]);
      if (topic) {
        return {
          topic,
          children: children ?? [],
          capabilities: (caps ?? []).map((c: any) => c.capabilities).filter(Boolean),
          blogs: blogs?.length ? blogs : (bundledContent.topic(data.slug)?.blogs ?? []),
        };
      }
    } catch {
      // Fall through to bundled content.
    }
    const fallback = bundledContent.topic(data.slug);
    if (!fallback) throw new Error("Topic not found");
    return fallback;
  });

export const getBlog = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    try {
      const sb = await admin();
      const { data: blog, error } = await sb
        .from("blogs")
        .select("*")
        .eq("slug", data.slug)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (blog) {
        const { data: cites } = await sb
          .from("blog_sources")
          .select("label,position,sources(id,slug,url,title,tier,tags,summary)")
          .eq("blog_id", blog.id)
          .order("position");
        return {
          blog,
          citations: (cites ?? []).map((c: any) => ({ label: c.label, source: c.sources })),
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
      const { data: design, error } = await sb
        .from("designs")
        .select("*")
        .eq("slug", data.slug)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (design) {
        const { data: cites } = await sb
          .from("design_sources")
          .select("label,position,sources(id,slug,url,title,tier,tags,summary)")
          .eq("design_id", design.id)
          .order("position");
        return {
          design,
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
      .from("blogs")
      .select("slug,title,summary,topic_slug,updated_at")
      .eq("status", "published")
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
      .from("designs")
      .select("id,slug,title,summary,status,updated_at")
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
      .from("lessons")
      .select("id,slug,title,depth,capability_id")
      .order("depth")
      .order("title");
    if (error) throw new Error(error.message);
    return data ?? [];
  } catch {
    return [];
  }
});

export const listClaimsByCapability = createServerFn({ method: "GET" })
  .inputValidator((d: { capabilityId?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const sb = await admin();
      let q = sb
        .from("claims")
        .select("id,text,depth,type,tags,capability_id,sources(slug,url,title,tier)")
        .eq("active", true)
        .order("depth");
      if (data.capabilityId) q = q.eq("capability_id", data.capabilityId);
      const { data: rows, error } = await q.limit(500);
      if (error) throw new Error(error.message);
      if (rows?.length) return rows;
    } catch {
      // Fall through to bundled content.
    }
    const claims = bundledContent.claims();
    return data.capabilityId
      ? claims.filter((claim) => claim.capability_id === data.capabilityId)
      : claims.slice(0, 500);
  });

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
      const like = `%${term}%`;
      const [b, c, s, t] = await Promise.all([
        sb
          .from("blogs")
          .select("slug,title,summary")
          .or(`title.ilike.${like},summary.ilike.${like},body_md.ilike.${like}`)
          .limit(15),
        sb
          .from("claims")
          .select("id,text,depth,capability_id,sources(slug,title,tier,url)")
          .eq("active", true)
          .ilike("text", like)
          .limit(20),
        sb
          .from("sources")
          .select("slug,title,url,tier,summary")
          .or(`title.ilike.${like},summary.ilike.${like}`)
          .limit(15),
        sb
          .from("topics")
          .select("slug,name,description")
          .or(`name.ilike.${like},description.ilike.${like}`)
          .limit(10),
      ]);
      const result = {
        blogs: b.data ?? [],
        claims: c.data ?? [],
        sources: s.data ?? [],
        topics: t.data ?? [],
      };
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
  .inputValidator((d: { itemType: "blog" | "topic" | "source" | "claim"; itemKey: string }) => d)
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
      "blogs",
      "diagrams",
      "help_docs",
    ] as const;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const { count } = await sb.from(t).select("*", { count: "exact", head: true });
      counts[t] = count ?? 0;
    }
    return counts;
  });
