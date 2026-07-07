import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getContentItem, getContentSiblings, listTopics } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { PrintButton } from "@/components/PrintButton";
import { ContentItemArticle } from "@/components/ContentItemArticle";
import { ContentHero } from "@/components/ContentHero";
import { ContentTocSidebar, useTocHeadings } from "@/components/ContentTocSidebar";
import { MobileTocDrawer } from "@/components/MobileTocDrawer";
import { ArticleSiblingsNav } from "@/components/ArticleSiblingsNav";
import { CitationSidebar } from "@/components/CitationSidebar";
import { TopicTree } from "@/components/TopicTree";
import { FavoriteButton } from "@/components/FavoriteButton";
import { BookOpen } from "lucide-react";
import { useReadingProgress } from "@/lib/use-reading-progress";
import { ResumeReadingPill } from "@/components/ResumeReadingPill";

const KINDS = new Set(["article", "design", "lesson"]);

const contentItemQO = (kind: string, slug: string) =>
  queryOptions({
    queryKey: ["content-item", kind, slug],
    queryFn: () =>
      getContentItem({ data: { kind: kind as "article" | "design" | "lesson", slug } }),
  });

const siblingsQO = (kind: string, slug: string) =>
  queryOptions({
    queryKey: ["content-siblings", kind, slug],
    queryFn: () =>
      getContentSiblings({ data: { kind: kind as "article" | "design" | "lesson", slug } }),
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
        context.queryClient.ensureQueryData(siblingsQO(params.kind, params.slug)),
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
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(contentItemQO(kind, slug));
  const { data: topics } = useSuspenseQuery(topicsQO);
  const { data: siblings } = useSuspenseQuery(siblingsQO(kind, slug));
  const { item, citations } = data;
  const capabilities = (data as any).capabilities ?? [];
  const diagramMeta = (data as any).diagrams ?? [];
  const hasPreview = capabilities.some((c: any) => c?.maturity === "preview");
  const headings = useTocHeadings(item.body_md ?? "");
  const diagramCount = [
    ...(item.body_md ?? "").matchAll(/!\[[^\]]*\]\((\/content\/diagrams\/[^)\s]+)\)/g),
  ].length;
  const [progress, setProgress] = useState(0);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const savedProgress = useReadingProgress(kind, slug);
  const showResume =
    savedProgress != null && savedProgress.pct > 10 && savedProgress.pct < 95;

  // [ / ] jumps to previous / next sibling article.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (t?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[" && siblings.prev) {
        e.preventDefault();
        navigate({
          to: "/blogs/$kind/$slug",
          params: { kind, slug: siblings.prev.slug },
        });
      } else if (e.key === "]" && siblings.next) {
        e.preventDefault();
        navigate({
          to: "/blogs/$kind/$slug",
          params: { kind, slug: siblings.next.slug },
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [siblings, kind, navigate]);


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

  useEffect(() => {
    function handleCiteClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor && anchor.getAttribute("href")?.startsWith("#src-")) {
        e.preventDefault();
        setCitationsOpen(true);
        const targetId = anchor.getAttribute("href")?.substring(1);
        if (targetId) {
          setTimeout(() => {
            const el = document.getElementById(targetId);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              el.classList.add(
                "ring-2",
                "ring-teal-400",
                "ring-offset-2",
                "ring-offset-background",
                "duration-500",
                "transition-all",
              );
              setTimeout(() => {
                el.classList.remove(
                  "ring-2",
                  "ring-teal-400",
                  "ring-offset-2",
                  "ring-offset-background",
                );
              }, 2500);
            }
          }, 150);
        }
      }
    }
    document.addEventListener("click", handleCiteClick);
    return () => {
      document.removeEventListener("click", handleCiteClick);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <div
        className="no-print sticky top-14 z-20 h-1 bg-muted"
        role="presentation"
        aria-hidden="true"
      >
        <div
          className="h-full origin-left bg-teal-300 will-change-transform"
          style={{ transform: `scaleX(${progress / 100})`, width: "100%" }}
        />
      </div>
      <div className="mx-auto flex max-w-[1600px] gap-6 px-6 py-10">
        <div className="hidden lg:block">
          <TopicTree topics={topics} activeSlug={item.topic_slug ?? undefined} />
        </div>

        <div
          className={`mx-auto grid w-full gap-8 transition-all duration-300 ${
            citationsOpen
              ? "max-w-7xl lg:grid-cols-[220px_1fr_300px]"
              : "max-w-5xl lg:grid-cols-[220px_1fr]"
          }`}
        >
          <aside className="hidden lg:block">
            <div className="sticky top-20 space-y-4">
              <Link to="/blogs" className="text-xs text-muted-foreground hover:text-foreground">
                ← All blogs
              </Link>
              <ContentTocSidebar headings={headings} />
            </div>
          </aside>

          <article>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Link
                to="/blogs"
                className="text-xs text-muted-foreground hover:text-foreground lg:hidden"
              >
                ← All blogs
              </Link>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {citations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCitationsOpen(!citationsOpen)}
                    className="no-print inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-border hover:text-foreground"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>{citationsOpen ? "Hide Sources" : `Sources (${citations.length})`}</span>
                  </button>
                )}
                <FavoriteButton
                  itemType={kind as "article" | "design" | "lesson"}
                  itemKey={item.slug}
                />
                <PrintButton
                  getMeta={() => ({
                    title: item.title,
                    summary: item.summary,
                    tags: item.tags,
                    updatedAt: item.updated_at,
                    citations,
                  })}
                />
              </div>
            </div>
            <ContentHero
              item={item}
              citationCount={citations.length}
              diagramCount={diagramCount}
              hasPreview={hasPreview}
            />

            <ContentItemArticle
              bodyMd={item.body_md ?? ""}
              diagramMeta={diagramMeta}
              citations={citations}
            />

            <ArticleSiblingsNav
              kind={kind as "article" | "design" | "lesson"}
              prev={siblings.prev}
              next={siblings.next}
            />
          </article>

          <aside className={`print-sources ${citationsOpen ? "block" : "hidden print:block"}`}>
            <div className="sticky top-20">
              <CitationSidebar citations={citations} />
            </div>
          </aside>
        </div>
      </div>
      <MobileTocDrawer headings={headings} />
      {showResume && savedProgress && (
        <ResumeReadingPill pct={savedProgress.pct} scrollY={savedProgress.scrollY} />
      )}
    </div>
  );
}
