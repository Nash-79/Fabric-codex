import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { listContentItems, listTopics } from "@/lib/atlas.functions";

export const Route = createFileRoute("/designs")({
  head: () => ({
    meta: [
      { title: "Designs — Fabric Atlas" },
      {
        name: "description",
        content: "Cited Microsoft Fabric solution architectures, grounded in verified claims.",
      },
    ],
  }),
  component: DesignsGalleryPage,
});

function DesignsGalleryPage() {
  const { data: topics } = useQuery({ queryKey: ["topics"], queryFn: () => listTopics() });
  const { data, isLoading, error } = useQuery({
    queryKey: ["content-items", "design"],
    queryFn: () => listContentItems({ data: { kind: "design" } }),
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

  const topicGroups = useMemo(() => {
    const groups = new Map<string, { label: string; items: any[] }>();
    for (const item of items) {
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
  }, [items, topicName, topicOrder]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Architecture
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Designs</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Cited Microsoft Fabric solution architectures, grounded in verified claims. Looking for
          articles or tiered lessons instead? See{" "}
          <Link to="/blogs" className="text-teal-600 hover:underline dark:text-teal-300">
            Articles
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
            No designs published yet.
          </div>
        )}

        <div className="mt-8 space-y-10">
          {topicGroups.map((group) => (
            <section key={group.label}>
              <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </h2>
              {group.items.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No designs in this topic yet.</p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {group.items.map((item: any) => (
                    <Link
                      key={item.slug}
                      to="/blogs/$kind/$slug"
                      params={{ kind: "design", slug: item.slug }}
                      className="block rounded-lg border border-border bg-card p-5 transition hover:border-border hover:bg-accent"
                    >
                      <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                      {(item.scenario || item.summary) && (
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                          {item.scenario || item.summary}
                        </p>
                      )}
                      {Array.isArray(item.tags) && item.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {item.tags.slice(0, 4).map((tag: string) => (
                            <span
                              key={tag}
                              className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
