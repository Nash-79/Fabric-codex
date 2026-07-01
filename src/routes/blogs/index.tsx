import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { KindBadge } from "@/components/KindBadge";
import { listContentItems, listTopics } from "@/lib/atlas.functions";

type Kind = "article" | "design" | "lesson";
const KIND_FILTERS: { id: "article" | "lesson" | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "article", label: "Articles" },
  { id: "lesson", label: "Lessons" },
];

type ContentSearch = { kind?: Kind };

export const Route = createFileRoute("/blogs/")({
  validateSearch: (search: Record<string, unknown>): ContentSearch => ({
    kind:
      search.kind === "article" || search.kind === "design" || search.kind === "lesson"
        ? search.kind
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Blogs — Fabric Atlas" },
      {
        name: "description",
        content: "All cited Microsoft Fabric articles, designs, and lessons in one place.",
      },
    ],
  }),
  component: ContentListPage,
});

function ContentListPage() {
  const search = Route.useSearch();
  const [kind, setKind] = useState<Kind | "all">(search.kind ?? "all");
  const [topicSlug, setTopicSlug] = useState<string>("");

  const { data: topics } = useQuery({ queryKey: ["topics"], queryFn: () => listTopics() });
  const { data, isLoading, error } = useQuery({
    queryKey: ["content-items", topicSlug],
    queryFn: () =>
      listContentItems({
        data: {
          topicSlug: topicSlug || undefined,
        },
      }),
  });

  const topicName = useMemo(() => {
    const map = new Map((topics ?? []).map((t: any) => [t.slug, t.name]));
    return (slug: string | null) => (slug ? (map.get(slug) ?? slug) : null);
  }, [topics]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    return data.filter((item: any) => {
      if (kind === "all") return true;
      if (kind === "article") return item.kind === "article" || item.kind === "design";
      return item.kind === kind;
    });
  }, [data, kind]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Reading &amp; reference
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Blogs</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Articles, solution architectures, and lessons — all grounded in verified claims, all in
          one list. Filter by kind or topic.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-md border border-border bg-card p-1">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setKind(f.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                  kind === f.id || (f.id === "article" && kind === "design")
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={topicSlug}
            onChange={(e) => setTopicSlug(e.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
          >
            <option value="">All topics</option>
            {(topics ?? []).map((t: any) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-8 space-y-3">
          {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {error && <div className="text-sm text-rose-300">{(error as Error).message}</div>}
          {!isLoading && filteredItems.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No content matches these filters yet.
            </div>
          )}
          {filteredItems.map((item: any) => (
            <Link
              key={`${item.kind}-${item.slug}`}
              to="/blogs/$kind/$slug"
              params={{ kind: item.kind, slug: item.slug }}
              className="block rounded-lg border border-border bg-card p-5 transition hover:border-border hover:bg-accent"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <KindBadge kind={item.kind} />
                  <h2 className="text-lg font-semibold text-foreground">{item.title}</h2>
                </div>
                {topicName(item.topic_slug) && (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {topicName(item.topic_slug)}
                  </span>
                )}
              </div>
              {item.summary && <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>}
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
