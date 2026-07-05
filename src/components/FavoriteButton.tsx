import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { listMyFavorites, toggleFavorite } from "@/lib/atlas.functions";
import { Button } from "@/components/ui/button";

type FavoriteItemType =
  "blog" | "article" | "design" | "lesson" | "topic" | "capability" | "source" | "claim";

export function FavoriteButton({
  itemType,
  itemKey,
  label = "Favorite",
}: {
  itemType: FavoriteItemType;
  itemKey: string;
  label?: string;
}) {
  const listFn = useServerFn(listMyFavorites);
  const toggleFn = useServerFn(toggleFavorite);
  const queryClient = useQueryClient();
  const favorites = useQuery({
    queryKey: ["favorites"],
    queryFn: () => listFn(),
    retry: false,
  });
  const favorited = (favorites.data ?? []).some(
    (f: any) => f.item_type === itemType && f.item_key === itemKey,
  );
  const toggle = useMutation({
    mutationFn: () => toggleFn({ data: { itemType, itemKey } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success(result.favorited ? "Added to favorites." : "Removed from favorites.");
    },
    onError: () => toast.error("Sign in to manage favorites."),
  });

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="no-print h-10 border-border bg-card text-foreground"
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      aria-pressed={favorited}
    >
      <Star className={`mr-2 h-4 w-4 ${favorited ? "fill-current text-amber-400" : ""}`} />
      {favorited ? "Favorited" : label}
    </Button>
  );
}
