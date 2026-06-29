import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { getDesign } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { TierBadge } from "@/components/Badges";
import { PrintButton } from "@/components/PrintButton";
import { readingTime } from "@/lib/reading-time";
import { markdownPanels } from "@/components/MarkdownPanels";

type Citation = {
  label: string;
  source?: {
    url?: string;
    title?: string;
    tier?: number;
    summary?: string;
  };
};

const designQO = (slug: string) =>
  queryOptions({ queryKey: ["design", slug], queryFn: () => getDesign({ data: { slug } }) });

export const Route = createFileRoute("/design/$slug")({
  head: ({ loaderData }: { loaderData?: Awaited<ReturnType<typeof getDesign>> }) => ({
    meta: [
      { title: loaderData ? `${loaderData.design.title} — Fabric Atlas` : "Design — Fabric Atlas" },
      { name: "description", content: loaderData?.design.summary ?? "" },
      { property: "og:title", content: loaderData?.design.title ?? "Fabric Atlas" },
      { property: "og:description", content: loaderData?.design.summary ?? "" },
    ],
  }),
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(designQO(params.slug));
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
      <p className="mt-6">Design not found.</p>
      <Link to="/designs" className="mt-3 inline-block underline">
        Back to designs
      </Link>
    </div>
  ),
  component: DesignPage,
});

function DesignPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(designQO(slug));
  const { design, citations } = data;

  const renderedBody = design.body_md.replace(
    /\[S(\d+)\]/g,
    (_m: string, n: string) => `[S${n}](#src-${n})`,
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center justify-between gap-3">
          <Link to="/designs" className="text-xs text-muted-foreground hover:text-foreground">
            ← Designs
          </Link>
          <PrintButton />
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{design.title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">{readingTime(design.body_md)} min read</p>
        {design.summary && (
          <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{design.summary}</p>
        )}

        <div className="prose prose-invert prose-lg mt-8 max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-12 prose-h2:border-b prose-h2:border-border prose-h2:pb-2 prose-h2:text-2xl prose-h3:mt-8 prose-h3:text-xl prose-p:leading-relaxed prose-a:text-teal-300 prose-strong:text-foreground prose-li:marker:text-teal-400 prose-img:rounded-xl prose-img:border prose-img:border-border">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
            urlTransform={(url) =>
              url.startsWith("/content/diagrams/")
                ? url.replace("/content/diagrams/", "/diagrams/")
                : url
            }
            components={{
              ...markdownPanels,
              a: ({ href, children, ...rest }) => {
                if (href?.startsWith("#src-")) {
                  return (
                    <sup>
                      <a href={href} className="text-teal-300 no-underline hover:underline">
                        {children}
                      </a>
                    </sup>
                  );
                }
                return (
                  <a href={href} {...rest}>
                    {children}
                  </a>
                );
              },
            }}
          >
            {renderedBody}
          </ReactMarkdown>
        </div>

        {citations.length > 0 && (
          <section className="print-sources mt-14 border-t border-border pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Sources
            </h2>
            <ol className="mt-4 space-y-3">
              {citations.map((c: Citation, i: number) => {
                const n = i + 1;
                return (
                  <li
                    key={c.label}
                    id={`src-${n}`}
                    className="rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <a
                        href={c.source?.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-foreground hover:text-teal-300"
                      >
                        [{c.label}] {c.source?.title}
                      </a>
                      {c.source?.tier && <TierBadge tier={c.source.tier} />}
                    </div>
                    {c.source?.summary && (
                      <p className="mt-1 text-xs text-muted-foreground">{c.source.summary}</p>
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
