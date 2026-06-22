import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { listSources } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { TierBadge } from "@/components/Badges";
import { Input } from "@/components/ui/input";

const sourcesQO = queryOptions({ queryKey: ["sources"], queryFn: () => listSources() });

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "Sources — Fabric Atlas" },
      {
        name: "description",
        content: "Approved sources backing every claim in the Fabric Atlas, scored by trust tier.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(sourcesQO),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-background p-10 text-foreground dark:bg-[#070b16] dark:text-white">
      <SiteHeader />
      <p className="mt-6 text-rose-300">{error.message}</p>
      <button className="mt-3 underline" onClick={reset}>
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-white">Not found.</div>,
  component: SourcesPage,
});

function SourcesPage() {
  const { data: sources } = useSuspenseQuery(sourcesQO);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<number | null>(null);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return sources.filter((s) => {
      if (tier && s.tier !== tier) return false;
      if (!term) return true;
      return (
        s.title.toLowerCase().includes(term) ||
        s.summary.toLowerCase().includes(term) ||
        s.tags?.some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [sources, q, tier]);

  return (
    <div className="min-h-screen bg-background text-foreground dark:bg-[#070b16] dark:text-white">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Approved sources
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Sources</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/55">
          Every claim cites one of these. Tier 1 = Microsoft Learn, 6 = unknown.
        </p>

        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sources…"
            className="border-white/10 bg-white/[0.04] text-white placeholder:text-white/40 md:max-w-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            {[null, 1, 2, 3, 4, 5, 6].map((t) => (
              <button
                key={String(t)}
                onClick={() => setTier(t)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  tier === t
                    ? "border-white/30 bg-white/10 text-white"
                    : "border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/5"
                }`}
              >
                {t === null ? "All tiers" : `T${t}`}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-8 grid gap-3 md:grid-cols-2">
          {filtered.map((s) => (
            <li key={s.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-white hover:text-teal-300"
                >
                  {s.title}
                </a>
                <TierBadge tier={s.tier} />
              </div>
              {s.summary && <p className="mt-1.5 text-xs text-white/55">{s.summary}</p>}
              {s.tags?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.tags.slice(0, 8).map((t) => (
                    <span
                      key={t}
                      className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/55"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-white/15 p-12 text-center text-white/55">
              No sources match.
            </div>
          )}
        </ul>
      </div>
    </div>
  );
}
