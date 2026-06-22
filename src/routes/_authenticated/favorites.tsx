import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyFavorites, toggleFavorite } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";

type FavoriteItemType = "blog" | "topic" | "source" | "claim";

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
    mutationFn: (v: { itemType: FavoriteItemType; itemKey: string }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Favorites</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Articles, topics, claims, and sources you bookmarked.
        </p>

        <ul className="mt-8 space-y-2">
          {isLoading && <li className="text-muted-foreground">Loading…</li>}
          {!isLoading && (data ?? []).length === 0 && (
            <li className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
              Nothing bookmarked yet.{" "}
              <Link to="/topics" className="text-teal-300 underline-offset-4 hover:underline">
                Browse the atlas
              </Link>
              .
            </li>
          )}
          {(data ?? []).map((f) => (
            <li
              key={`${f.item_type}:${f.item_key}`}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3"
            >
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {f.item_type}
                </div>
                <div className="text-sm text-foreground">{f.item_key}</div>
              </div>
              <button
                onClick={() =>
                  remove.mutate({ itemType: f.item_type as FavoriteItemType, itemKey: f.item_key })
                }
                className="text-xs text-muted-foreground hover:text-foreground"
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
