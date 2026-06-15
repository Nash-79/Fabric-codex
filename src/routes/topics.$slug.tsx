import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getTopic } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { accent } from "@/lib/fabric-theme";

const topicQO = (slug: string) =>
  queryOptions({ queryKey: ["topic", slug], queryFn: () => getTopic({ data: { slug } }) });

export const Route = createFileRoute("/topics/$slug")({
  head: ({ loaderData }: { loaderData?: Awaited<ReturnType<typeof getTopic>> }) => ({
    meta: [
      { title: loaderData ? `${loaderData.topic.name} — Fabric Atlas` : "Topic — Fabric Atlas" },
      { name: "description", content: loaderData?.topic.description ?? "" },
    ],
  }),
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(topicQO(params.slug));
    } catch {
      throw notFound();
    }
  },
  errorComponent: ({ error, reset }) => (
    <div className="min-h-screen bg-[#070b16] p-10 text-white">
      <SiteHeader />
      <p className="mt-6 text-rose-300">{error.message}</p>
      <button className="mt-3 underline" onClick={reset}>Retry</button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen bg-[#070b16] p-10 text-white">
      <SiteHeader />
      <p className="mt-6">Topic not found.</p>
      <Link to="/topics" className="mt-3 inline-block underline">Back to topics</Link>
    </div>
  ),
  component: TopicPage,
});

function TopicPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(topicQO(slug));
  const { topic, children, capabilities, blogs } = data;

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Link to="/topics" className="text-xs text-white/55 hover:text-white">← All topics</Link>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{topic.name}</h1>
        <p className="mt-3 text-lg leading-relaxed text-white/70">{topic.description}</p>

        {capabilities.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {capabilities.map((c: any) => {
              const a = accent(c.accent);
              return (
                <Link
                  key={c.id}
                  to="/atlas"
                  search={{ capability: c.id }}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${a.chip}`}
                >
                  <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${a.dot}`} />
                  {c.name}
                </Link>
              );
            })}
          </div>
        )}

        {blogs.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Articles</h2>
            <ul className="mt-3 space-y-2">
              {blogs.map((b: any) => (
                <li key={b.slug}>
                  <Link
                    to="/blog/$slug"
                    params={{ slug: b.slug }}
                    className="block rounded-xl border border-white/10 bg-white/[0.02] p-4 hover:bg-white/[0.05]"
                  >
                    <div className="font-medium text-white">{b.title}</div>
                    <div className="mt-1 text-sm text-white/55">{b.summary}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {children.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Subtopics</h2>
            <ul className="mt-3 space-y-1.5">
              {children.map((c) => (
                <li key={c.slug}>
                  <Link
                    to="/topics/$slug"
                    params={{ slug: c.slug }}
                    className="block rounded-md px-2 py-1.5 text-sm text-white/85 hover:bg-white/5 hover:text-white"
                  >
                    {c.name} — <span className="text-white/45">{c.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
