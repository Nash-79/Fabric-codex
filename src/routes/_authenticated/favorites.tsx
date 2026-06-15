import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyFavorites, toggleFavorite } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { AssetCard } from "@/components/AssetCard";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({ meta: [{ title: "Favorites — Fabric Atlas" }] }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const favsFn = useServerFn(listMyFavorites);
  const toggleFn = useServerFn(toggleFavorite);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["favorites"], queryFn: () => favsFn() });
  const toggle = useMutation({
    mutationFn: (id: string) => toggleFn({ data: { assetId: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">Your atlas</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Favorites</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55">Patterns and blueprints you bookmarked.</p>

        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading && <div className="col-span-full text-white/50">Loading…</div>}
          {!isLoading && (data ?? []).length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-white/15 p-12 text-center text-white/55">
              No favorites yet.{" "}
              <Link to="/atlas" className="font-medium text-teal-300 underline-offset-4 hover:underline">
                Browse the atlas
              </Link>
              .
            </div>
          )}
          {(data ?? []).map((f) =>
            f.assets ? (
              <AssetCard
                key={f.asset_id}
                asset={f.assets as any}
                favorited
                pending={toggle.isPending}
                onToggle={() => toggle.mutate(f.asset_id)}
              />
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
