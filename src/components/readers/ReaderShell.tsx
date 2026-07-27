import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { listMyContentFeedback } from "@/lib/atlas.functions";
import { SiteHeader } from "@/components/SiteHeader";
import { PrintButton } from "@/components/PrintButton";
import { ContentItemArticle } from "@/components/ContentItemArticle";
import {
  ContentTocSidebar,
  useActiveHeading,
  useTocHeadings,
} from "@/components/ContentTocSidebar";
import { MobileTocDrawer } from "@/components/MobileTocDrawer";
import { ArticleSiblingsNav } from "@/components/ArticleSiblingsNav";
import { ArticleBreadcrumb } from "@/components/ArticleBreadcrumb";
import { CitationSidebar, type Citation } from "@/components/CitationSidebar";
import { CitationDrawer } from "@/components/CitationDrawer";
import { FavoriteButton } from "@/components/FavoriteButton";
import { ContentFeedbackButton } from "@/components/ContentFeedbackButton";
import { readOrCreateAnonToken, useHasSession } from "@/lib/use-feedback-identity";
import { ContentFeedbackRail } from "@/components/ContentFeedbackRail";
import { BookOpen } from "lucide-react";
import { useReadingProgress } from "@/lib/use-reading-progress";
import { ResumeReadingPill } from "@/components/ResumeReadingPill";
import { accent } from "@/lib/fabric-theme";
import { CAPABILITY_NAMES } from "@/lib/capability-names";
import { presentationProfileSchema } from "@/lib/content-presentation";
import { resolveReaderShell } from "@/components/readers";

// The controller for the content detail reader. Owns everything cross-cutting: data derivation,
// the three scroll mechanisms (router-level scrollRestoration is untouched/external; this owns
// the progress-bar listener and use-reading-progress's resume pill), bracket-key sibling nav, the
// citation-click interceptor, the Sources drawer's open state, the action bar, and the single
// <article> tag (containing {resolved shell's hero output} + ContentItemArticle +
// ArticleSiblingsNav, in that order — PrintButton's document.querySelector("article") and
// export-pdf.ts's block-walk depend on this staying a single element in this relative order).
// Archetype-specific shells (EditorialReader/TutorialReader/ArchitectureReader/LessonReader) are
// thin, stateless, effect-free — they never own layout, the action bar, or the <article> tag.
export function ReaderShell({
  kind,
  slug,
  from,
  fromSlug,
  q,
  item,
  citations,
  capabilities,
  diagramMeta,
  siblings,
  originTopicName,
}: {
  kind: "article" | "design" | "lesson";
  slug: string;
  from?: string;
  fromSlug?: string;
  q?: string;
  item: any;
  citations: Citation[];
  capabilities: any[];
  diagramMeta: any[];
  siblings: {
    prev: { slug: string; title: string } | null;
    next: { slug: string; title: string } | null;
  };
  originTopicName?: string;
}) {
  const navigate = useNavigate();
  const hasPreview = capabilities.some((c: any) => c?.maturity === "preview");
  // presentation_profile is stored as untyped jsonb — parse it through the same Zod schema
  // publish-time validation uses. A malformed/legacy value falls back to undefined (no
  // archetype-specific treatment) rather than throwing on the reading path.
  const parsedProfile = presentationProfileSchema.safeParse((item as any).presentation_profile);
  const profile = parsedProfile.success ? parsedProfile.data : undefined;
  // presentation_profile.accent (an explicit editorial choice) overrides the incidental
  // capability-derived accent when set; capability accent remains the fallback.
  const capabilityAccent = capabilities[0]?.id
    ? CAPABILITY_NAMES[capabilities[0].id as string]?.accent
    : undefined;
  const resolvedAccent = accent(profile?.accent ?? capabilityAccent);
  const headings = useTocHeadings(item.body_md ?? "");
  const tocHeadings = headings.filter((h) => h.kind !== "subheading");
  const activeSectionId = useActiveHeading(tocHeadings);
  // Real content embeds /diagrams/... (mirrored public path), not /content/diagrams/... — this
  // must match scripts/validate-content.mjs's markdownDiagram regex exactly, or the two drift.
  const diagramCount = [
    ...(item.body_md ?? "").matchAll(/!\[[^\]]*\]\((?:\/content)?\/diagrams\/([^)\s]+)\)/g),
  ].length;

  // "Already reported this section" — best-effort, not part of the page's critical render path:
  // the anon token is only resolvable client-side after mount, and a failed/slow lookup should
  // never block or degrade the article itself, just leave the reported-state indicator quiet.
  const listMyFeedbackFn = useServerFn(listMyContentFeedback);
  const hasSession = useHasSession();
  const { data: myFeedback } = useQuery({
    queryKey: ["my-content-feedback", item.id, hasSession],
    queryFn: () =>
      listMyFeedbackFn({
        data: {
          contentItemId: item.id,
          anonToken: hasSession ? undefined : readOrCreateAnonToken(),
        },
      }),
    enabled: hasSession !== null,
  });
  const reportedSectionIds = useMemo(
    () => new Set((myFeedback ?? []).map((f) => f.section_id).filter((id): id is string => !!id)),
    [myFeedback],
  );

  const [progress, setProgress] = useState(0);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const savedProgress = useReadingProgress(kind, slug);
  const showResume = savedProgress != null && savedProgress.pct > 10 && savedProgress.pct < 95;

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

  const Shell = resolveReaderShell(profile?.archetype);

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

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex gap-8">
          <aside className="hidden lg:block lg:w-56 lg:shrink-0">
            <div className="sticky top-20 space-y-4">
              <ArticleBreadcrumb
                from={from}
                fromSlug={fromSlug}
                q={q}
                topicName={originTopicName}
              />
              <ContentTocSidebar headings={headings} />
            </div>
          </aside>

          <div className="mx-auto w-full max-w-3xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="lg:hidden">
                <ArticleBreadcrumb
                  from={from}
                  fromSlug={fromSlug}
                  q={q}
                  topicName={originTopicName}
                />
              </span>
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
                <FavoriteButton itemType={kind} itemKey={item.slug} />
                <ContentFeedbackButton
                  contentItemId={item.id}
                  sections={headings}
                  defaultSectionId={activeSectionId ?? undefined}
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

            <article className="min-w-0">
              <Shell
                item={item}
                citationCount={citations.length}
                diagramCount={diagramCount}
                hasPreview={hasPreview}
                presentationProfile={profile}
                accent={resolvedAccent}
              />

              <ContentItemArticle
                bodyMd={item.body_md ?? ""}
                diagramMeta={diagramMeta}
                citations={citations}
                contentItemId={item.id}
                sections={headings}
                reportedSectionIds={reportedSectionIds}
                archetype={profile?.archetype}
                density={profile?.reading_density}
              />

              <ArticleSiblingsNav kind={kind} prev={siblings.prev} next={siblings.next} />
            </article>

            {/* Always-mounted, print-only: Sheet content unmounts on close, so relying on the
                drawer alone would silently drop Sources from printed/PDF output for anyone who
                never opened it during their session. */}
            <div className="print-sources hidden print:block">
              <CitationSidebar citations={citations} />
            </div>
          </div>
        </div>
      </div>

      <CitationDrawer citations={citations} open={citationsOpen} onOpenChange={setCitationsOpen} />
      <MobileTocDrawer headings={headings} />
      <ContentFeedbackRail
        contentItemId={item.id}
        headings={tocHeadings}
        reportedSectionIds={reportedSectionIds}
      />
      {showResume && savedProgress && (
        <ResumeReadingPill pct={savedProgress.pct} scrollY={savedProgress.scrollY} />
      )}
    </div>
  );
}
