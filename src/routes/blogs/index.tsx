import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { listContentItems, listTopics } from "@/lib/atlas.functions";
import { readingTime } from "@/lib/reading-time";
import { presentationProfileSchema } from "@/lib/content-presentation";

const ARCHETYPE_LABEL: Record<string, string> = {
  "deep-dive": "Deep dive",
  tutorial: "Tutorial",
  "field-guide": "Field guide",
  architecture: "Architecture",
  lesson: "Lesson",
  explainer: "Explainer",
};

export const Route = createFileRoute("/blogs/")({
  // The old /designs listing used to live at /blogs?kind=design before /designs became a real
  // gallery — keep that one old URL working.
  loaderDeps: ({ search }: { search: { kind?: string } }) => ({ kind: search.kind }),
  loader: ({ deps }) => {
    if (deps.kind === "design") throw redirect({ to: "/designs" });
  },
  validateSearch: (search: Record<string, unknown>): { kind?: string } => ({
    kind: typeof search.kind === "string" ? search.kind : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Articles — Fabric Atlas" },
      {
        name: "description",
        content: "Cited Microsoft Fabric articles, grounded in verified claims.",
      },
    ],
  }),
  component: ArticlesFeedPage,
});

function parseProfile(item: any) {
  const result = presentationProfileSchema.safeParse(item?.presentation_profile);
  return result.success ? result.data : undefined;
}

function ArticlesFeedPage() {
  const { data: topics } = useQuery({ queryKey: ["topics"], queryFn: () => listTopics() });
  const { data, isLoading, error } = useQuery({
    queryKey: ["content-items", "article"],
    queryFn: () => listContentItems({ data: { kind: "article" } }),
  });

  const topicName = useMemo(() => {
    const map = new Map((topics ?? []).map((t: any) => [t.slug, t.name]));
    return (slug: string | null) => (slug ? (map.get(slug) ?? slug) : null);
  }, [topics]);

  const topicOrder = useMemo(() => {
    const map = new Map((topics ?? []).map((t: any, i: number) => [t.slug, t.sort_order ?? i]));
    return (slug: string | null) =>
      slug ? (map.get(slug) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
  }, [topics]);

  const items = data ?? [];
  // Server already sorts by updated_at desc.
  const featured = items[0];
  const rest = items.slice(1);

  const topicGroups = useMemo(() => {
    const groups = new Map<string, { label: string; items: any[] }>();
    for (const item of rest) {
      const key = item.topic_slug ?? "__uncategorized";
      const label = item.topic_slug ? (topicName(item.topic_slug) ?? item.topic_slug) : "General";
      if (!groups.has(key)) groups.set(key, { label, items: [] });
      groups.get(key)!.items.push(item);
    }
    return [...groups.entries()]
      .sort(([aSlug], [bSlug]) => {
        if (aSlug === "__uncategorized") return 1;
        if (bSlug === "__uncategorized") return -1;
        return topicOrder(aSlug) - topicOrder(bSlug);
      })
      .map(([, group]) => group);
  }, [rest, topicName, topicOrder]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Reading &amp; reference
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Articles</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Cited Microsoft Fabric articles, grounded in verified claims. Looking for architecture
          designs or tiered lessons instead? See{" "}
          <Link to="/designs" className="text-teal-600 hover:underline dark:text-teal-300">
            Designs
          </Link>{" "}
          or{" "}
          <Link to="/learn" className="text-teal-600 hover:underline dark:text-teal-300">
            Learn
          </Link>
          .
        </p>

        {isLoading && <div className="mt-8 text-sm text-muted-foreground">Loading…</div>}
        {error && (
          <div className="mt-8 text-sm text-rose-600 dark:text-rose-300">
            {(error as Error).message}
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <div className="mt-8 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No articles published yet.
          </div>
        )}

        {featured && (
          <Link
            to="/blogs/$kind/$slug"
            params={{ kind: "article", slug: featured.slug }}
            className="mt-8 block rounded-xl border border-border bg-card p-6 shadow-sm transition hover:border-teal-500/50"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-300">
              Featured
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {featured.title}
            </h2>
            {featured.summary && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {featured.summary}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {topicName(featured.topic_slug) && <span>{topicName(featured.topic_slug)}</span>}
              <span aria-hidden="true">·</span>
              <span>~{readingTime(featured.summary ?? "")} min read</span>
            </div>
          </Link>
        )}

        <div className="mt-10 space-y-10">
          {topicGroups.map((group) => (
            <section key={group.label}>
              <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </h2>
              {group.items.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No articles in this topic yet.</p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {group.items.map((item: any) => {
                    const profile = parseProfile(item);
                    const archetypeLabel = profile?.archetype
                      ? ARCHETYPE_LABEL[profile.archetype]
                      : undefined;
                    return (
                      <Link
                        key={item.slug}
                        to="/blogs/$kind/$slug"
                        params={{ kind: "article", slug: item.slug }}
                        className="block rounded-lg border border-border bg-card p-5 transition hover:border-border hover:bg-accent"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                          {archetypeLabel && (
                            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {archetypeLabel}
                            </span>
                          )}
                        </div>
                        {item.summary && (
                          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                            {item.summary}
                          </p>
                        )}
                        {profile?.featured_diagram && (
                          <img
                            src={`/diagrams/${profile.featured_diagram}.svg`}
                            alt=""
                            aria-hidden="true"
                            className="mt-3 h-24 w-full rounded-md border border-border object-cover"
                          />
                        )}
                        <div className="mt-3 text-xs text-muted-foreground">
                          ~{readingTime(item.summary ?? "")} min read
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
