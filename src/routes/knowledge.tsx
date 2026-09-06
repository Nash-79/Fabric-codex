import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { listContentItems, listTopics } from "@/lib/atlas.functions";

/**
 * The Knowledge Hub: one surface over content_items.
 *
 * /blogs, /designs and /learn were three near-identical pages differing only by a `kind` filter
 * -- designs.tsx was close to a line-for-line copy of blogs/index.tsx -- and each carried prose
 * explaining that it was not the other two. That is a filter, not an information architecture.
 * They now redirect here and the distinction is a chip.
 *
 * The reader route (/blogs/$kind/$slug) is untouched; it is good and it stays.
 */

type Kind = "article" | "design" | "lesson";
const KINDS: { id: Kind | "all"; label: string; blurb: string }[] = [
  { id: "all", label: "Everything", blurb: "Every published piece, newest first" },
  { id: "article", label: "Articles", blurb: "Cited, source-grounded explainers and deep dives" },
  {
    id: "design",
    label: "Architectures",
    blurb: "Solution designs assembled from verified claims",
  },
  { id: "lesson", label: "Lessons", blurb: "Tiered learning, Beginner through Expert" },
];

type Search = { kind?: Kind | "all"; topic?: string };

export const Route = createFileRoute("/knowledge")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    kind: (["all", "article", "design", "lesson"] as const).includes(search.kind as Kind | "all")
      ? (search.kind as Kind | "all")
      : undefined,
    topic: typeof search.topic === "string" && search.topic ? search.topic : undefined,
  }),
  component: KnowledgeHubPage,
});

function KnowledgeHubPage() {
  const { kind = "all", topic } = Route.useSearch();
  const navigate = Route.useNavigate();

  const { data: topics } = useQuery({ queryKey: ["topics"], queryFn: () => listTopics() });
  // Fetched unfiltered and narrowed on the client: the kind chips then switch instantly rather
  // than refetching, and the counts stay honest because every chip is counted from one dataset.
  const { data, isLoading, error } = useQuery({
    queryKey: ["content-items", "all"],
    queryFn: () => listContentItems({ data: {} }),
  });

  const all = useMemo(() => data ?? [], [data]);

  const topicName = useMemo(() => {
    const map = new Map(
      (topics ?? []).map((t: { slug: string; name: string }) => [t.slug, t.name]),
    );
    return (slug: string | null) => (slug ? (map.get(slug) ?? slug) : null);
  }, [topics]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const item of all) c[item.kind] = (c[item.kind] ?? 0) + 1;
    return c;
  }, [all]);

  // Topic chips are built from what is actually present, so a topic with nothing published never
  // appears as an empty filter.
  const presentTopics = useMemo(() => {
    const seen = new Map<string, number>();
    for (const item of all) {
      if (!item.topic_slug) continue;
      if (kind !== "all" && item.kind !== kind) continue;
      seen.set(item.topic_slug, (seen.get(item.topic_slug) ?? 0) + 1);
    }
    return [...seen.entries()]
      .map(([slug, count]) => ({ slug, count, name: topicName(slug) ?? slug }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [all, kind, topicName]);

  const items = useMemo(() => {
    let list = kind === "all" ? all : all.filter((i) => i.kind === kind);
    if (topic) list = list.filter((i) => i.topic_slug === topic);
    return list;
  }, [all, kind, topic]);

  const setFilter = (next: Partial<Search>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });

  const activeKind = KINDS.find((k) => k.id === kind) ?? KINDS[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Knowledge Hub</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {activeKind.blurb}. Everything here is grounded in cited sources — follow any piece
          through to the claims behind it.
        </p>

        <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by kind">
          {KINDS.map((k) => {
            const active = k.id === kind;
            return (
              <button
                key={k.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter({ kind: k.id === "all" ? undefined : k.id })}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium transition " +
                  (active
                    ? "border-teal-500 bg-teal-500/10 text-teal-800 dark:text-teal-200"
                    : "border-border text-muted-foreground hover:border-teal-500/50")
                }
              >
                {k.label}
                {counts[k.id] ? (
                  <span className="ml-1.5 text-muted-foreground">{counts[k.id]}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {presentTopics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
            {topic && (
              <button
                type="button"
                onClick={() => setFilter({ topic: undefined })}
                className="rounded-full border border-teal-500 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-800 dark:text-teal-200"
              >
                Clear topic
              </button>
            )}
            {presentTopics.slice(0, 12).map((t) => (
              <button
                key={t.slug}
                type="button"
                aria-pressed={topic === t.slug}
                onClick={() => setFilter({ topic: topic === t.slug ? undefined : t.slug })}
                className={
                  "rounded-full border px-3 py-1 text-xs transition " +
                  (topic === t.slug
                    ? "border-teal-500 bg-teal-500/10 text-teal-800 dark:text-teal-200"
                    : "border-border text-muted-foreground hover:border-teal-500/50")
                }
              >
                {t.name} <span className="text-muted-foreground">{t.count}</span>
              </button>
            ))}
          </div>
        )}

        {isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}
        {error && (
          <p className="mt-8 text-sm text-rose-600 dark:text-rose-300">
            {(error as Error).message}
          </p>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nothing published under this filter yet.
          </div>
        )}

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to="/blogs/$kind/$slug"
                params={{ kind: item.kind, slug: item.slug }}
                className="flex h-full flex-col rounded-xl border border-border bg-card p-4 transition hover:border-teal-500/50"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                  {KINDS.find((k) => k.id === item.kind)?.label ?? item.kind}
                </div>
                <h2 className="mt-2 text-base font-semibold leading-snug">{item.title}</h2>
                {item.summary && (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {item.summary}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-xs text-muted-foreground">
                  {topicName(item.topic_slug) && <span>{topicName(item.topic_slug)}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
