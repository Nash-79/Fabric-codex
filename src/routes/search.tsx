import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { searchAll, listContentItems } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { Input } from "@/components/ui/input";
import { DepthBadge, TierBadge } from "@/components/Badges";
import { KindBadge } from "@/components/KindBadge";
import { cn } from "@/lib/utils";

type ContentKind = "article" | "design" | "lesson";
type SearchRoute = {
  q?: string;
  kind?: ContentKind;
  capability?: string;
  depth?: number;
  tier?: number;
};

const KIND_CHIPS: { id: ContentKind | "all"; label: string }[] = [
  { id: "all", label: "All Content" },
  { id: "article", label: "Articles" },
  { id: "design", label: "Designs" },
  { id: "lesson", label: "Lessons" },
];

const DEPTH_FILTERS = [
  { depth: 1, label: "L1 Conceptual" },
  { depth: 2, label: "L2 Practitioner" },
  { depth: 3, label: "L3 Architect" },
  { depth: 4, label: "L4 Performance" },
  { depth: 5, label: "L5 Internals" },
];

const TIER_FILTERS = [
  { tier: 1, label: "Tier 1: MS Learn" },
  { tier: 2, label: "Tier 2: Fabric Blog" },
  { tier: 3, label: "Tier 3: MS GitHub" },
  { tier: 4, label: "Tier 4: MVP / Community" },
];

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): SearchRoute => ({
    q: typeof search.q === "string" ? search.q.slice(0, 500) : undefined,
    kind: (["article", "design", "lesson"] as const).includes(search.kind as ContentKind)
      ? (search.kind as ContentKind)
      : undefined,
    capability: typeof search.capability === "string" ? search.capability : undefined,
    depth: typeof search.depth === "number" ? search.depth : undefined,
    tier: typeof search.tier === "number" ? search.tier : undefined,
  }),
  head: () => ({ meta: [{ title: "Search — Fabric Atlas" }] }),
  component: SearchPage,
});

function SearchPage() {
  const fn = useServerFn(searchAll);
  const navigate = useNavigate({ from: "/search" });
  const { q: activeQuery, kind, capability, depth, tier } = Route.useSearch();
  const [draft, setDraft] = useState(activeQuery ?? "");

  useEffect(() => {
    setDraft(activeQuery ?? "");
  }, [activeQuery]);

  const hasQuery = !!activeQuery?.trim();

  const results = useQuery({
    queryKey: ["search", activeQuery],
    queryFn: () => fn({ data: { q: activeQuery as string } }),
    enabled: hasQuery,
    staleTime: 60_000,
  });

  const library = useQuery({
    queryKey: ["content-items", "library", kind, capability],
    queryFn: () => listContentItems({ data: { kind, capabilityId: capability } }),
    enabled: !hasQuery,
    staleTime: 60_000,
  });
  const libraryItems = (library.data ?? []).slice(0, 40);

  function run(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    navigate({ search: { q: trimmed || undefined, kind, capability, depth, tier } });
  }

  function setKind(next: ContentKind | "all") {
    navigate({
      search: {
        q: activeQuery,
        kind: next === "all" ? undefined : next,
        capability,
        depth,
        tier,
      },
    });
  }

  function setCapability(nextCap?: string) {
    navigate({
      search: {
        q: activeQuery,
        kind,
        capability: nextCap === capability ? undefined : nextCap,
        depth,
        tier,
      },
    });
  }

  function setDepthFilter(nextDepth?: number) {
    navigate({
      search: {
        q: activeQuery,
        kind,
        capability,
        depth: nextDepth === depth ? undefined : nextDepth,
        tier,
      },
    });
  }

  function setTierFilter(nextTier?: number) {
    navigate({
      search: {
        q: activeQuery,
        kind,
        capability,
        depth,
        tier: nextTier === tier ? undefined : nextTier,
      },
    });
  }

  function resetFilters() {
    navigate({ search: { q: activeQuery } });
  }

  const hasActiveFilters = Boolean(kind || capability || depth || tier);

  // Filter results by active facets
  const filteredBlogs = (results.data?.blogs ?? []).filter((b: any) => {
    if (kind && (b.kind ?? "article") !== kind) return false;
    if (capability && b.capability_id && b.capability_id !== capability) return false;
    if (depth && Array.isArray(b.depth_levels) && !b.depth_levels.includes(depth)) return false;
    return true;
  });

  const filteredClaims = (results.data?.claims ?? []).filter((c: any) => {
    if (capability && c.capability_id !== capability) return false;
    if (depth && c.depth !== depth) return false;
    if (tier && c.sources?.tier !== tier) return false;
    return true;
  });

  const filteredSources = (results.data?.sources ?? []).filter((s: any) => {
    if (tier && s.tier !== tier) return false;
    return true;
  });

  const filteredTopics = (results.data?.topics ?? []).filter((_t: any) => {
    return !depth && !tier;
  });

  const totalFilteredCount =
    filteredBlogs.length + filteredClaims.length + filteredSources.length + filteredTopics.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Search</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Search across topics, articles, claims, and sources with hybrid semantic retrieval.
            </p>
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-rose-500 hover:text-rose-600 dark:text-rose-400 hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>

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

        {/* Facet Chips */}
        <div className="mt-4 space-y-2.5">
          {/* Content Kind */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground mr-1">Kind:</span>
            {KIND_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setKind(chip.id)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
                  (kind ?? "all") === chip.id
                    ? "border-teal-500/40 bg-teal-500/15 text-teal-700 dark:text-teal-300 font-semibold"
                    : "border-border bg-card text-muted-foreground hover:bg-accent",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Depth Facet */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground mr-1">Depth:</span>
            {DEPTH_FILTERS.map((df) => (
              <button
                key={df.depth}
                type="button"
                onClick={() => setDepthFilter(df.depth)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px] font-medium transition",
                  depth === df.depth
                    ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-semibold"
                    : "border-border/80 bg-card/60 text-muted-foreground hover:bg-accent",
                )}
              >
                {df.label}
              </button>
            ))}
          </div>

          {/* Trust Tier Facet */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground mr-1">Trust:</span>
            {TIER_FILTERS.map((tf) => (
              <button
                key={tf.tier}
                type="button"
                onClick={() => setTierFilter(tf.tier)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px] font-medium transition",
                  tier === tf.tier
                    ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                    : "border-border/80 bg-card/60 text-muted-foreground hover:bg-accent",
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {!hasQuery && (
          <div className="mt-10">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Library
            </h2>
            {library.isLoading && (
              <div className="mt-3 text-sm text-muted-foreground">Loading…</div>
            )}
            {!library.isLoading && libraryItems.length === 0 && (
              <div className="mt-3 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nothing published yet for this filter.
              </div>
            )}
            <div className="mt-3 space-y-1">
              {libraryItems.map((item: any) => (
                <Link
                  key={`${item.kind}-${item.slug}`}
                  to="/blogs/$kind/$slug"
                  params={{ kind: item.kind, slug: item.slug }}
                  search={{ from: "search" }}
                  className="block rounded-md p-2 hover:bg-accent"
                >
                  <div className="flex items-center gap-2">
                    <KindBadge kind={item.kind} />
                    <span className="text-sm font-medium text-foreground">{item.title}</span>
                  </div>
                  {item.summary && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{item.summary}</div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {results.data && (
          <div className="mt-10 space-y-10">
            {totalFilteredCount === 0 && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No matching results found for active query and filters.{" "}
                <button onClick={resetFilters} className="text-primary hover:underline font-medium">
                  Reset filters
                </button>
              </div>
            )}

            {filteredTopics.length > 0 && (
              <Section title={`Topics (${filteredTopics.length})`}>
                {filteredTopics.map((t: any) => (
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
            )}

            {filteredBlogs.length > 0 && (
              <Section title={`Content (${filteredBlogs.length})`}>
                {filteredBlogs.map((b: any) => (
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
            )}

            {filteredClaims.length > 0 && (
              <Section title={`Claims (${filteredClaims.length})`}>
                {filteredClaims.map((c: any) => (
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
                        className="mt-1 block text-xs text-teal-600 dark:text-teal-300 hover:underline"
                      >
                        {c.sources.title}
                      </a>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {filteredSources.length > 0 && (
              <Section title={`Sources (${filteredSources.length})`}>
                {filteredSources.map((s: any) => (
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
            )}
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
