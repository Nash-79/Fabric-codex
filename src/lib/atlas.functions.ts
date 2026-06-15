import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const listDomains = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await getAdmin();
  const { data, error } = await sb
    .from("domains")
    .select("id, slug, name, tagline, description, accent, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const listAssets = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await getAdmin();
  const { data, error } = await sb
    .from("assets")
    .select("id, slug, title, summary, asset_type, tags, maturity, domain_id, domains(slug, name, accent)")
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const getAssetBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const { data: asset, error } = await sb
      .from("assets")
      .select("id, slug, title, summary, body, asset_type, tags, maturity, created_at, domains(slug, name, tagline, accent)")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!asset) throw new Error("Asset not found");
    return asset;
  });

export const listMyFavorites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("favorites")
      .select("asset_id, created_at, assets(id, slug, title, summary, tags, maturity, asset_type, domains(slug, name, accent))")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assetId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("favorites")
      .select("asset_id")
      .eq("user_id", userId)
      .eq("asset_id", data.assetId)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("asset_id", data.assetId);
      if (error) throw new Error(error.message);
      return { favorited: false };
    }
    const { error } = await supabase.from("favorites").insert({ user_id: userId, asset_id: data.assetId });
    if (error) throw new Error(error.message);
    return { favorited: true };
  });
