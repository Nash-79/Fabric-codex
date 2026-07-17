import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { searchAll } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { DepthBadge, TierBadge } from "@/components/Badges";
import { KindBadge } from "@/components/KindBadge";

type SearchRoute = { q?: string };

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): SearchRoute => ({
    q: typeof search.q === "string" ? search.q.slice(0, 500) : undefined,
  }),
  head: () => ({ meta: [{ title: "Search — Fabric Atlas" }] }),
  component: SearchPage,
});

function SearchPage() {
  const fn = useServerFn(searchAll);
  const navigate = useNavigate({ from: "/search" });
  const { q: activeQuery } = Route.useSearch();
  // Local input state can lag the URL (typing before submit); the query itself lives in the URL
  // so back/forward and page reloads restore both the box contents and the fetched results —
  // previously this was plain useState, so browser back after opening a result cleared it all.
  const [draft, setDraft] = useState(activeQuery ?? "");

  useEffect(() => {
    setDraft(activeQuery ?? "");
  }, [activeQuery]);

  const results = useQuery({
    queryKey: ["search", activeQuery],
    queryFn: () => fn({ data: { q: activeQuery as string } }),
    enabled: !!activeQuery?.trim(),
    staleTime: 60_000,
  });

  function run(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    navigate({ search: { q: trimmed } });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Search</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Search across topics, articles, claims, and sources.
        </p>
        <form onSubmit={run} className="mt-6 flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="OneLake shortcuts, Direct Lake fallback, capacity throttling…"
            className="border-border bg-card text-foreground placeholder:text-muted-foreground"
          />
          <button
            disabled={results.isFetching}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {results.isFetching ? "…" : "Search"}
          </button>
        </form>

        {results.data && (
          <div className="mt-10 space-y-10">
            <Section title={`Topics (${results.data.topics.length})`}>
              {results.data.topics.map((t) => (
                <Link
                  key={t.slug}
                  to="/topics/$slug"
                  params={{ slug: t.slug }}
                  className="block rounded-md p-2 hover:bg-accent"
                >
                  <div className="text-sm font-medium text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.description}</div>
                </Link>
              ))}
            </Section>
            <Section title={`Content (${results.data.blogs.length})`}>
              {results.data.blogs.map((b: any) => (
                <Link
                  key={`${b.kind ?? "article"}-${b.slug}`}
                  to="/blogs/$kind/$slug"
                  params={{ kind: b.kind ?? "article", slug: b.slug }}
                  search={{ from: "search", q: activeQuery }}
                  className="block rounded-md p-2 hover:bg-accent"
                >
                  <div className="flex items-center gap-2">
                    <KindBadge kind={b.kind ?? "article"} />
                    <span className="text-sm font-medium text-foreground">{b.title}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{b.summary}</div>
                </Link>
              ))}
            </Section>
            <Section title={`Claims (${results.data.claims.length})`}>
              {results.data.claims.map((c: any) => (
                <div key={c.id} className="rounded-md p-2">
                  <div className="flex items-center gap-2">
                    <DepthBadge depth={c.depth} />
                    {c.sources?.tier && <TierBadge tier={c.sources.tier} />}
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {c.capability_id}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{c.text}</p>
                  {c.sources && (
                    <a
                      href={c.sources.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-xs text-teal-300 hover:underline"
                    >
                      {c.sources.title}
                    </a>
                  )}
                </div>
              ))}
            </Section>
            <Section title={`Sources (${results.data.sources.length})`}>
              {results.data.sources.map((s) => (
                <a
                  key={s.slug}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md p-2 hover:bg-accent"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{s.title}</span>
                    <TierBadge tier={s.tier} />
                  </div>
                  <div className="text-xs text-muted-foreground">{s.summary}</div>
                </a>
              ))}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="mt-2 space-y-1">{children}</div>
    </section>
  );
}
