import { TierBadge } from "@/components/Badges";

export type Citation = {
  label: string;
  source?: {
    url?: string;
    title?: string;
    tier?: number;
    summary?: string;
  };
};

// Shared numbered source-citation list, used by the unified content detail page. Anchors each
// entry as #src-N so inline [S1]/[S2] markers in the body can link down to it.
export function CitationSidebar({ citations }: { citations: Citation[] }) {
  return (
    <div className="sticky top-20 rounded-md border border-border bg-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Sources
      </div>
      {citations.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No citations attached.</p>
      )}
      <ol className="mt-3 max-h-[70vh] space-y-2 overflow-auto pr-1">
        {citations.map((c, i) => {
          const n = i + 1;
          return (
            <li
              key={c.label}
              id={`src-${n}`}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="flex flex-col gap-2">
                <a
                  href={c.source?.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium leading-relaxed text-foreground hover:text-teal-300"
                >
                  [{c.label}] {c.source?.title}
                </a>
                {c.source?.tier && <TierBadge tier={c.source.tier} />}
              </div>
              {c.source?.summary && (
                <p className="mt-1 text-xs text-muted-foreground">{c.source.summary}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
