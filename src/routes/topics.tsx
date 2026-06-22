import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listTopics } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { useMemo } from "react";

const topicsQO = queryOptions({ queryKey: ["topics"], queryFn: () => listTopics() });

export const Route = createFileRoute("/topics")({
  head: () => ({
    meta: [
      { title: "Topics — Fabric Atlas" },
      {
        name: "description",
        content: "Browse Microsoft Fabric topics organised by capability and depth.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(topicsQO),
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-background p-10 text-foreground">
      <SiteHeader />
      <p className="mt-6 text-rose-300">Could not load topics. {error.message}</p>
      <button className="mt-3 underline" onClick={reset}>
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-foreground">Not found.</div>,
  component: TopicsPage,
});

type Topic = {
  slug: string;
  parent_slug: string | null;
  name: string;
  description: string;
  sort_order: number;
};

function TopicsPage() {
  const { data: topics } = useSuspenseQuery(topicsQO);
  const roots = useMemo(() => topics.filter((t) => !t.parent_slug), [topics]);
  const byParent = useMemo(() => {
    const m = new Map<string, Topic[]>();
    for (const t of topics) {
      if (t.parent_slug) m.set(t.parent_slug, [...(m.get(t.parent_slug) ?? []), t]);
    }
    return m;
  }, [topics]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-teal-300/80">
          Knowledge map
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Topics</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Microsoft Fabric organised by capability area. Pick a topic to read its cited article and
          source claims.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {roots.map((root) => (
            <section key={root.slug} className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold text-foreground">{root.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{root.description}</p>
              <ul className="mt-4 space-y-1.5">
                {(byParent.get(root.slug) ?? []).map((child) => (
                  <li key={child.slug}>
                    <Link
                      to="/topics/$slug"
                      params={{ slug: child.slug }}
                      className="group flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
                    >
                      <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">
                        {child.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {child.description}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {roots.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
              No topics yet. An admin can bootstrap bundled content from the{" "}
              <Link to="/settings" className="text-teal-300 underline-offset-4 hover:underline">
                settings page
              </Link>
              .
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
