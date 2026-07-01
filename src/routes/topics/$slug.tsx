import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getTopic, listTopics } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { MaturityBadge } from "@/components/Badges";
import { KindBadge } from "@/components/KindBadge";
import { TopicTree } from "@/components/TopicTree";
import { accent } from "@/lib/fabric-theme";

type TopicCapability = {
  id: string;
  name: string;
  accent: string;
  maturity?: string | null;
};

type TopicContentItem = {
  kind: string;
  slug: string;
  title: string;
  summary: string;
};

const topicQO = (slug: string) =>
  queryOptions({ queryKey: ["topic", slug], queryFn: () => getTopic({ data: { slug } }) });

const topicsQO = queryOptions({ queryKey: ["topics"], queryFn: () => listTopics() });

export const Route = createFileRoute("/topics/$slug")({
  head: ({ loaderData }: { loaderData?: Awaited<ReturnType<typeof getTopic>> }) => ({
    meta: [
      { title: loaderData ? `${loaderData.topic.name} — Fabric Atlas` : "Topic — Fabric Atlas" },
      { name: "description", content: loaderData?.topic.description ?? "" },
    ],
  }),
  loader: async ({ context, params }) => {
    try {
      const [topic] = await Promise.all([
        context.queryClient.ensureQueryData(topicQO(params.slug)),
        context.queryClient.ensureQueryData(topicsQO),
      ]);
      return topic;
    } catch {
      throw notFound();
    }
  },
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-background p-10 text-foreground">
      <SiteHeader />
      <p className="mt-6 text-rose-300">{error.message}</p>
      <button className="mt-3 underline" onClick={reset}>
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-background p-10 text-foreground">
      <SiteHeader />
      <p className="mt-6">Topic not found.</p>
      <Link to="/topics" className="mt-3 inline-block underline">
        Back to topics
      </Link>
    </div>
  ),
  component: TopicPage,
});

function TopicPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(topicQO(slug));
  const { data: topics } = useSuspenseQuery(topicsQO);
  const { topic, children, capabilities } = data;
  const items = ((data as any).items ?? data.blogs ?? []) as TopicContentItem[];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="mx-auto flex max-w-[1400px] gap-6 px-6 py-12">
        <div className="hidden lg:block">
          <TopicTree topics={topics} activeSlug={topic.slug} />
        </div>
        <div className="mx-auto w-full max-w-4xl">
          <Link to="/topics" className="text-xs text-muted-foreground hover:text-foreground">
            ← All topics
          </Link>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{topic.name}</h1>
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{topic.description}</p>

          {capabilities.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5">
              {(capabilities as TopicCapability[]).map((c) => {
                const a = accent(c.accent);
                return (
                  <Link
                    key={c.id}
                    to="/registry/$id"
                    params={{ id: c.id }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${a.chip}`}
                  >
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${a.dot}`} />
                    {c.name}
                    {c.maturity === "preview" && <MaturityBadge maturity="preview" />}
                  </Link>
                );
              })}
            </div>
          )}

          {items.length > 0 && (
            <section className="mt-10">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Content
              </h2>
              <ul className="mt-3 space-y-2">
                {items.map((item) => (
                  <li key={`${item.kind}-${item.slug}`}>
                    <Link
                      to="/content/$kind/$slug"
                      params={{ kind: item.kind, slug: item.slug }}
                      className="block rounded-xl border border-border bg-card p-4 hover:bg-accent"
                    >
                      <div className="flex items-center gap-2">
                        <KindBadge kind={item.kind} />
                        <div className="font-medium text-foreground">{item.title}</div>
                      </div>
                      {item.summary && (
                        <div className="mt-1 text-sm text-muted-foreground">{item.summary}</div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {children.length > 0 && (
            <section className="mt-10">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Subtopics
              </h2>
              <ul className="mt-3 space-y-1.5">
                {children.map((c) => (
                  <li key={c.slug}>
                    <Link
                      to="/topics/$slug"
                      params={{ slug: c.slug }}
                      className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {c.name} — <span className="text-muted-foreground">{c.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
