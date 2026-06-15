import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listTopics = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb
    .from("topics")
    .select("slug,parent_slug,name,description,sort_order")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listCapabilities = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb
    .from("capabilities")
    .select("id,name,description,accent");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getTopic = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const [{ data: topic }, { data: children }, { data: caps }, { data: blogs }] =
      await Promise.all([
        sb.from("topics").select("*").eq("slug", data.slug).maybeSingle(),
        sb.from("topics").select("slug,name,description,sort_order").eq("parent_slug", data.slug).order("sort_order"),
        sb.from("topic_capabilities").select("capability_id, capabilities(id,name,description,accent)").eq("topic_slug", data.slug),
        sb.from("blogs").select("slug,title,summary,updated_at").eq("topic_slug", data.slug).eq("status","published").order("updated_at", { ascending: false }),
      ]);
    if (!topic) throw new Error("Topic not found");
    return {
      topic,
      children: children ?? [],
      capabilities: (caps ?? []).map((c: any) => c.capabilities).filter(Boolean),
      blogs: blogs ?? [],
    };
  });

export const getBlog = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: blog, error } = await sb.from("blogs").select("*").eq("slug", data.slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!blog) throw new Error("Blog not found");
    const { data: cites } = await sb
      .from("blog_sources")
      .select("label,position,sources(id,slug,url,title,tier,tags,summary)")
      .eq("blog_id", blog.id)
      .order("position");
    return { blog, citations: (cites ?? []).map((c: any) => ({ label: c.label, source: c.sources })) };
  });

export const listBlogs = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb
    .from("blogs")
    .select("slug,title,summary,topic_slug,updated_at")
    .eq("status", "published")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listClaimsByCapability = createServerFn({ method: "GET" })
  .inputValidator((d: { capabilityId?: string }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    let q = sb
      .from("claims")
      .select("id,text,depth,type,tags,capability_id,sources(slug,url,title,tier)")
      .eq("active", true)
      .order("depth");
    if (data.capabilityId) q = q.eq("capability_id", data.capabilityId);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listSources = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb
    .from("sources")
    .select("id,slug,url,title,tier,tags,summary")
    .order("tier")
    .order("title");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listHelp = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await admin();
  const { data, error } = await sb.from("help_docs").select("*").order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const searchAll = createServerFn({ method: "GET" })
  .inputValidator((d: { q: string }) => d)
  .handler(async ({ data }) => {
    const sb = await admin();
    const term = data.q.trim();
    if (!term) return { blogs: [], claims: [], sources: [], topics: [] };
    const like = `%${term}%`;
    const [b, c, s, t] = await Promise.all([
      sb.from("blogs").select("slug,title,summary").or(`title.ilike.${like},summary.ilike.${like},body_md.ilike.${like}`).limit(15),
      sb.from("claims").select("id,text,depth,capability_id,sources(slug,title,tier,url)").eq("active", true).ilike("text", like).limit(20),
      sb.from("sources").select("slug,title,url,tier,summary").or(`title.ilike.${like},summary.ilike.${like}`).limit(15),
      sb.from("topics").select("slug,name,description").or(`name.ilike.${like},description.ilike.${like}`).limit(10),
    ]);
    return { blogs: b.data ?? [], claims: c.data ?? [], sources: s.data ?? [], topics: t.data ?? [] };
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
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    return { admin: !!data };
  });

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const sb = await admin();
    const tables = ["topics", "capabilities", "sources", "claims", "blogs", "diagrams", "help_docs"] as const;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const { count } = await sb.from(t).select("*", { count: "exact", head: true });
      counts[t] = count ?? 0;
    }
    return counts;
  });
