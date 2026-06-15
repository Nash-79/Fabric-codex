import { Link } from "@tanstack/react-router";
import { accent } from "@/lib/fabric-theme";
import { Bookmark, BookmarkCheck } from "lucide-react";

type Asset = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  asset_type: string;
  tags: string[];
  maturity: string;
  domains?: { slug: string; name: string; accent: string } | null;
};

export function AssetCard({
  asset,
  favorited,
  onToggle,
  pending,
}: {
  asset: Asset;
  favorited?: boolean;
  onToggle?: () => void;
  pending?: boolean;
}) {
  const a = accent(asset.domains?.accent);
  return (
    <div className={`group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b ${a.grad} from-[6%] to-white/[0.02] p-5 transition hover:border-white/20`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/50">
            <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
            {asset.domains?.name}
            <span className="text-white/20">·</span>
            <span>{asset.asset_type}</span>
          </div>
          <Link to="/atlas/$slug" params={{ slug: asset.slug }} className="mt-2 block text-base font-semibold text-white hover:underline">
            {asset.title}
          </Link>
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            disabled={pending}
            className="rounded-md p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
          >
            {favorited ? <BookmarkCheck className="h-4 w-4 text-teal-300" /> : <Bookmark className="h-4 w-4" />}
          </button>
        )}
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white/65">{asset.summary}</p>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {asset.tags.slice(0, 4).map((t) => (
          <span key={t} className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${a.chip}`}>
            {t}
          </span>
        ))}
        {asset.maturity !== "stable" && (
          <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            {asset.maturity}
          </span>
        )}
      </div>
    </div>
  );
}
