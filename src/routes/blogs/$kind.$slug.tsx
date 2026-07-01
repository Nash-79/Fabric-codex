import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getContentItem, listTopics } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { PrintButton } from "@/components/PrintButton";
import { ContentItemArticle } from "@/components/ContentItemArticle";
import { ContentHero } from "@/components/ContentHero";
import { ContentTocSidebar, useTocHeadings } from "@/components/ContentTocSidebar";
import { CitationSidebar } from "@/components/CitationSidebar";
import { TopicTree } from "@/components/TopicTree";

const KINDS = new Set(["article", "design", "lesson"]);

const contentItemQO = (kind: string, slug: string) =>
  queryOptions({
    queryKey: ["content-item", kind, slug],
    queryFn: () =>
      getContentItem({ data: { kind: kind as "article" | "design" | "lesson", slug } }),
  });

const topicsQO = queryOptions({ queryKey: ["topics"], queryFn: () => listTopics() });

export const Route = createFileRoute("/blogs/$kind/$slug")({
  head: ({ loaderData }: { loaderData?: Awaited<ReturnType<typeof getContentItem>> }) => ({
    meta: [
      { title: loaderData ? `${loaderData.item.title} — Fabric Atlas` : "Content — Fabric Atlas" },
      { name: "description", content: loaderData?.item.summary ?? "" },
      { property: "og:title", content: loaderData?.item.title ?? "Fabric Atlas" },
      { property: "og:description", content: loaderData?.item.summary ?? "" },
    ],
  }),
  loader: async ({ context, params }) => {
    if (!KINDS.has(params.kind)) throw notFound();
    try {
      const [item] = await Promise.all([
        context.queryClient.ensureQueryData(contentItemQO(params.kind, params.slug)),
        context.queryClient.ensureQueryData(topicsQO),
      ]);
      return item;
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
      <p className="mt-6">Content not found.</p>
      <Link to="/blogs" className="mt-3 inline-block underline">
        Back to blogs
      </Link>
    </div>
  ),
  component: ContentItemPage,
});

function ContentItemPage() {
  const { kind, slug } = Route.useParams();
  const { data } = useSuspenseQuery(contentItemQO(kind, slug));
  const { data: topics } = useSuspenseQuery(topicsQO);
  const { item, citations } = data;
  const capabilities = (data as any).capabilities ?? [];
  const diagramMeta = (data as any).diagrams ?? [];
  const hasPreview = capabilities.some((c: any) => c?.maturity === "preview");
  const headings = useTocHeadings(item.body_md ?? "");
  const diagramCount = [
    ...(item.body_md ?? "").matchAll(/!\[[^\]]*\]\((\/content\/diagrams\/[^)\s]+)\)/g),
  ].length;
  const [progress, setProgress] = useState(0);

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
      <div className="mx-auto flex max-w-[1600px] gap-6 px-6 py-10">
        <div className="hidden lg:block">
          <TopicTree topics={topics} activeSlug={item.topic_slug ?? undefined} />
        </div>

        <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[220px_minmax(0,760px)_300px]">
          <aside className="hidden lg:block">
            <div className="sticky top-20 space-y-4">
              <Link to="/blogs" className="text-xs text-muted-foreground hover:text-foreground">
                ← All blogs
              </Link>
              <ContentTocSidebar headings={headings} />
            </div>
          </aside>

          <article>
            <div className="flex items-center justify-between gap-3">
              <Link
                to="/blogs"
                className="text-xs text-muted-foreground hover:text-foreground lg:hidden"
              >
                ← All blogs
              </Link>
              <PrintButton />
            </div>
            <ContentHero
              item={item}
              citationCount={citations.length}
              diagramCount={diagramCount}
              hasPreview={hasPreview}
            />

            <ContentItemArticle bodyMd={item.body_md ?? ""} diagramMeta={diagramMeta} />
          </article>

          <aside className="print-sources">
            <div className="sticky top-20">
              <CitationSidebar citations={citations} />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
