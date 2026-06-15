import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyFavorites, toggleFavorite } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/_authenticated/favorites")({
  head: () => ({ meta: [{ title: "Favorites — Fabric Atlas" }] }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const favsFn = useServerFn(listMyFavorites);
  const toggleFn = useServerFn(toggleFavorite);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["favorites"], queryFn: () => favsFn() });
  const remove = useMutation({
    mutationFn: (v: { itemType: any; itemKey: string }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Favorites</h1>
        <p className="mt-2 text-sm text-white/55">Articles, topics, claims, and sources you bookmarked.</p>

        <ul className="mt-8 space-y-2">
          {isLoading && <li className="text-white/50">Loading…</li>}
          {!isLoading && (data ?? []).length === 0 && (
            <li className="rounded-xl border border-dashed border-white/15 p-10 text-center text-white/55">
              Nothing bookmarked yet. <Link to="/atlas" className="text-teal-300 underline-offset-4 hover:underline">Browse the atlas</Link>.
            </li>
          )}
          {(data ?? []).map((f) => (
            <li key={`${f.item_type}:${f.item_key}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/45">{f.item_type}</div>
                <div className="text-sm text-white">{f.item_key}</div>
              </div>
              <button
                onClick={() => remove.mutate({ itemType: f.item_type as any, itemKey: f.item_key })}
                className="text-xs text-white/55 hover:text-white"
                disabled={remove.isPending}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
