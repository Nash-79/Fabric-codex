import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBlog } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { TierBadge } from "@/components/Badges";

const blogQO = (slug: string) =>
  queryOptions({ queryKey: ["blog", slug], queryFn: () => getBlog({ data: { slug } }) });

export const Route = createFileRoute("/blog/$slug")({
  head: ({ loaderData }: { loaderData?: Awaited<ReturnType<typeof getBlog>> }) => ({
    meta: [
      { title: loaderData ? `${loaderData.blog.title} — Fabric Atlas` : "Article — Fabric Atlas" },
      { name: "description", content: loaderData?.blog.summary ?? "" },
      { property: "og:title", content: loaderData?.blog.title ?? "Fabric Atlas" },
      { property: "og:description", content: loaderData?.blog.summary ?? "" },
    ],
  }),
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(blogQO(params.slug));
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
      <p className="mt-6">Article not found.</p>
      <Link to="/topics" className="mt-3 inline-block underline">Back to topics</Link>
    </div>
  ),
  component: BlogPage,
});

function BlogPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(blogQO(slug));
  const { blog, citations } = data;
  const citeMap = new Map(citations.map((c) => [c.label, c.source]));

  // Replace [S1] / [S1][S2] inline citations with clickable superscripts.
  const renderedBody = blog.body_md.replace(/\[S(\d+)\]/g, (_m, n) => ` <sup id="cite-${n}"><a href="#src-${n}" class="cite">[S${n}]</a></sup>`);

  return (
    <div className="min-h-screen bg-[#070b16] text-white">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-6 py-12">
        <Link to="/topics" className="text-xs text-white/55 hover:text-white">← Topics</Link>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{blog.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-white/70">{blog.summary}</p>

        <div className="prose prose-invert mt-8 max-w-none prose-headings:tracking-tight prose-a:text-teal-300 prose-img:rounded-xl prose-img:border prose-img:border-white/10">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={(url) =>
              url.startsWith("/content/diagrams/")
                ? url.replace("/content/diagrams/", "/diagrams/")
                : url
            }
            components={{
              sup: ({ children, ...rest }) => <sup {...rest}>{children}</sup>,
              a: ({ href, children, ...rest }) => {
                if (href?.startsWith("#src-")) {
                  return <a href={href} className="text-teal-300 no-underline hover:underline">{children}</a>;
                }
                return <a href={href} {...rest}>{children}</a>;
              },
            }}
          >
            {renderedBody}
          </ReactMarkdown>
        </div>

        {citations.length > 0 && (
          <section className="mt-14 border-t border-white/10 pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">Sources</h2>
            <ol className="mt-4 space-y-3">
              {citations.map((c, i) => {
                const n = i + 1;
                return (
                  <li key={c.label} id={`src-${n}`} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <a href={c.source?.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-white hover:text-teal-300">
                        [{c.label}] {c.source?.title}
                      </a>
                      {c.source?.tier && <TierBadge tier={c.source.tier} />}
                    </div>
                    {c.source?.summary && (
                      <p className="mt-1 text-xs text-white/55">{c.source.summary}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </article>
    </div>
  );
}

// suppress unused warning
void citeMap;
