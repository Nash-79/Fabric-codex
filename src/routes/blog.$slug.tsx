import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBlog } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { TierBadge } from "@/components/Badges";
import { PrintButton } from "@/components/PrintButton";
import { readingTime } from "@/lib/reading-time";

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
      <p className="mt-6">Article not found.</p>
      <Link to="/topics" className="mt-3 inline-block underline">
        Back to topics
      </Link>
    </div>
  ),
  component: BlogPage,
});

function BlogPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(blogQO(slug));
  const { blog, citations } = data;
  const [progress, setProgress] = useState(0);

  // Replace [S1] / [S1][S2] inline citations with clickable superscripts.
  const renderedBody = blog.body_md.replace(
    /\[S(\d+)\]/g,
    (_m: string, n: string) =>
      ` <sup id="cite-${n}"><a href="#src-${n}" class="cite">[S${n}]</a></sup>`,
  );
  const headings = useMemo(
    () =>
      [...blog.body_md.matchAll(/^##\s+(.+)$/gm)].map((match) => ({
        title: match[1],
        id: match[1]
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      })),
    [blog.body_md],
  );
  const diagrams = useMemo(
    () => [...blog.body_md.matchAll(/!\[[^\]]*\]\((\/content\/diagrams\/[^)\s]+)\)/g)],
    [blog.body_md],
  );

  useEffect(() => {
    function updateProgress() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0);
    }
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div className="sticky top-14 z-20 h-1 bg-muted">
        <div className="h-full bg-teal-300" style={{ width: `${progress}%` }} />
      </div>
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[220px_minmax(0,760px)_300px]">
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            <Link to="/topics" className="text-xs text-muted-foreground hover:text-foreground">
              ← Topics
            </Link>
            {headings.length > 0 && (
              <nav className="rounded-md border border-border bg-card p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contents
                </div>
                <div className="mt-2 space-y-1">
                  {headings.map((heading) => (
                    <a
                      key={heading.id}
                      href={`#${heading.id}`}
                      className="block rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {heading.title}
                    </a>
                  ))}
                </div>
              </nav>
            )}
          </div>
        </aside>

        <article>
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/topics"
              className="text-xs text-muted-foreground hover:text-foreground lg:hidden"
            >
              ← Topics
            </Link>
            <PrintButton />
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{blog.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{readingTime(blog.body_md)} min read</span>
            <span>·</span>
            <span>{citations.length} sources</span>
            <span>·</span>
            <span>{diagrams.length} diagrams</span>
          </div>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{blog.summary}</p>

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <Info label="Citation policy" value="Every factual claim cites a source" />
            <Info
              label="Depth range"
              value={blog.depth_levels?.length ? `L${blog.depth_levels.join(" · L")}` : "L1 · L5"}
            />
            <Info label="Format" value="Source-grounded article" />
          </div>

          <div className="prose prose-invert mt-8 max-w-none prose-headings:scroll-mt-24 prose-headings:tracking-tight prose-a:text-teal-300 prose-img:rounded-xl prose-img:border prose-img:border-border">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={(url) =>
                url.startsWith("/content/diagrams/")
                  ? url.replace("/content/diagrams/", "/diagrams/")
                  : url
              }
              components={{
                h2: ({ children, ...rest }) => {
                  const text = String(children);
                  const id = text
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "");
                  return (
                    <h2 id={id} {...rest}>
                      {children}
                    </h2>
                  );
                },
                sup: ({ children, ...rest }) => <sup {...rest}>{children}</sup>,
                a: ({ href, children, ...rest }) => {
                  if (href?.startsWith("#src-")) {
                    return (
                      <a href={href} className="text-teal-300 no-underline hover:underline">
                        {children}
                      </a>
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
        </article>

        <aside className="print-sources">
          <div className="sticky top-20 rounded-md border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sources
            </div>
            {citations.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">No citations attached.</p>
            )}
            <ol className="mt-3 max-h-[70vh] space-y-2 overflow-auto pr-1">
              {citations.map((c, i) => {
                const n = i + 1;
                return (
                  <li
                    key={c.label}
                    id={`src-${n}`}
                    className="rounded-md border border-border bg-card p-3"
                  >
                    <div className="flex flex-col gap-2">
                      <a
                        href={c.source?.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium leading-relaxed text-foreground hover:text-teal-300"
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
          </div>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{value}</div>
    </div>
  );
}
