import { useMemo, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import { ExternalLink } from "lucide-react";
import { markdownPanels } from "@/components/MarkdownPanels";
import { Callout } from "@/components/Callout";
import { DiagramLightbox } from "@/components/DiagramLightbox";
import { getAuthoredDiagram, getStaticDiagramSvg } from "@/diagrams/catalog";
import { AdvisorMermaidBlock } from "@/components/AdvisorMermaidBlock";
import { TierBadge } from "@/components/Badges";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { Citation } from "@/components/CitationSidebar";
import { slugifyHeading, textFromNode } from "@/lib/heading-utils";
import { codeLanguage } from "@/components/CodeBlock";
import { ContentFeedbackButton } from "@/components/ContentFeedbackButton";
import type { TocEntry } from "@/components/ContentTocSidebar";
import type { PresentationArchetype, ReadingDensity } from "@/lib/content-presentation";

type DiagramMeta = { path?: string; caption?: string };

// Hoverable [Sn] citation marker: hovering previews the cited source (title, tier, summary)
// with a working external link; clicking still opens the citations sidebar via the page-level
// click handler on #src-N anchors.
function CitationMark({
  href,
  citation,
  children,
}: {
  href: string;
  citation?: Citation;
  children: ReactNode;
}) {
  const anchor = (
    <a href={href} className="cite text-teal-600 no-underline hover:underline dark:text-teal-300">
      {children}
    </a>
  );
  if (!citation?.source) return anchor;
  const { source } = citation;
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>{anchor}</HoverCardTrigger>
      <HoverCardContent side="top" className="w-80">
        <div className="flex items-start justify-between gap-2">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium leading-snug text-foreground hover:text-teal-600 dark:hover:text-teal-300"
          >
            {source.title ?? source.url}
            <ExternalLink className="ml-1 inline h-3 w-3 align-baseline text-muted-foreground" />
          </a>
          {source.tier != null && <TierBadge tier={source.tier} />}
        </div>
        {source.summary && (
          <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
            {source.summary}
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

// Shared markdown body renderer for the unified content detail route (article/design/lesson).
// Extracted from blog.$slug.tsx (the richer of the two prior renderers — h2 anchor ids, image
// captions from the diagrams table, sup-wrapped inline citations, [!NOTE]-style callouts) so all
// three kinds get the same treatment. Previously only blogs had callouts and image captions;
// designs rendered plain blockquotes and uncaptioned images.
export function ContentItemArticle({
  bodyMd,
  diagramMeta = [],
  citations = [],
  contentItemId,
  sections = [],
  reportedSectionIds,
  archetype,
  density,
}: {
  bodyMd: string;
  diagramMeta?: DiagramMeta[];
  citations?: Citation[];
  /** When set, every heading gets an inline "give feedback on this section" trigger. */
  contentItemId?: string;
  /** Full heading list (## and ###) for the feedback dialog's section picker — see useTocHeadings. */
  sections?: TocEntry[];
  /** Sections the current identity already submitted feedback on — shown as a filled icon. */
  reportedSectionIds?: Set<string>;
  /** presentation_profile.archetype — drives the archetype-scoped CSS in styles.css. */
  archetype?: PresentationArchetype;
  /** presentation_profile.reading_density — drives the density-scoped CSS in styles.css. */
  density?: ReadingDensity;
}) {
  // Hover-only reveal (opacity-0 -> group-hover:opacity-100) leaves the copy-link and feedback
  // triggers permanently invisible on touch devices (no :hover) — this tracks which heading was
  // last tapped so its actions can be revealed on touch, without affecting desktop hover/keyboard
  // focus behavior at all (those are handled purely by CSS below, no state needed).
  const [tapRevealedId, setTapRevealedId] = useState<string | null>(null);

  const captionByFile = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of diagramMeta) {
      const base = (d.path ?? "").split("/").pop();
      if (base && d.caption) map.set(base, d.caption);
    }
    return map;
  }, [diagramMeta]);
  const srcByFile = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of diagramMeta) {
      const path = d.path ?? "";
      const base = path.split("/").pop();
      if (base && /^https?:\/\//i.test(path)) map.set(base, path);
    }
    return map;
  }, [diagramMeta]);

  // Replace [S1] / [S1][S2] inline citations with clickable superscripts.
  const renderedBody = bodyMd.replace(
    /\[S(\d+)\]/g,
    (_m: string, n: string) =>
      ` <sup id="cite-${n}"><a href="#src-${n}" class="cite">[S${n}]</a></sup>`,
  );

  // Compute figure numbers from the markdown source, not by mutating a counter during render.
  // React can render Markdown more than once during hydration; the old counter advanced on each
  // pass, producing figure-1 on the server and figure-2/4 on the client. That mismatch left the
  // visible SVG present but its React interaction handlers unreliable.
  const figureIndexByFile = useMemo(() => {
    const map = new Map<string, number>();
    let index = 0;
    for (const match of bodyMd.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const base = match[1]?.split("/").pop();
      if (!base) continue;
      index += 1;
      if (!map.has(base)) map.set(base, index);
    }
    return map;
  }, [bodyMd]);

  // The components map MUST be referentially stable. It is passed to ReactMarkdown as element
  // renderers; a new object per render means new component identities, and React responds by
  // unmounting and remounting the entire markdown tree. The article re-renders on every
  // scroll-driven ToC highlight change, so without this memo every figure lost its local state
  // (view toggles, selections) the moment the user scrolled — the "diagram reverts back to the
  // original" bug.
  const components = useMemo(
    () =>
      ({
        ...markdownPanels,
        pre: ({ children }) => {
          if (codeLanguage(children) === "mermaid") {
            return <AdvisorMermaidBlock code={textFromNode(children)} />;
          }
          const PanelPre = markdownPanels.pre as ComponentType<{ children?: ReactNode }>;
          return <PanelPre>{children}</PanelPre>;
        },
        h2: ({ children, ...rest }) => {
          const id = slugifyHeading(textFromNode(children));
          const revealed = tapRevealedId === id;
          return (
            <h2
              id={id}
              {...rest}
              className={`group relative pl-4 ${revealed ? "reveal-actions" : ""}`}
              onClick={(e) => {
                // Only tap-toggle when the heading text itself was tapped, not one of its action
                // buttons (the # link and feedback trigger have their own onClick already).
                if (e.target === e.currentTarget) {
                  setTapRevealedId((current) => (current === id ? null : id));
                }
              }}
            >
              <span
                className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-teal-400"
                aria-hidden="true"
              />
              {children}
              <a
                href={`#${id}`}
                aria-label="Copy link to section"
                data-no-print
                onClick={(e) => {
                  e.preventDefault();
                  const url = `${window.location.origin}${window.location.pathname}#${id}`;
                  navigator.clipboard?.writeText(url);
                  history.replaceState(null, "", `#${id}`);
                }}
                className="no-print ml-2 text-teal-500/40 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 group-[.reveal-actions]:opacity-100 hover:text-teal-500"
              >
                #
              </a>
              {contentItemId && (
                <ContentFeedbackButton
                  contentItemId={contentItemId}
                  sections={sections}
                  defaultSectionId={id}
                  variant="inline"
                  forceVisible={revealed}
                  alreadyReported={reportedSectionIds?.has(id)}
                />
              )}
            </h2>
          );
        },
        h3: ({ children, ...rest }) => {
          const id = slugifyHeading(textFromNode(children));
          const revealed = tapRevealedId === id;
          return (
            <h3
              id={id}
              {...rest}
              className={`group relative ${revealed ? "reveal-actions" : ""}`}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setTapRevealedId((current) => (current === id ? null : id));
                }
              }}
            >
              {children}
              <a
                href={`#${id}`}
                aria-label="Copy link to section"
                data-no-print
                onClick={(e) => {
                  e.preventDefault();
                  const url = `${window.location.origin}${window.location.pathname}#${id}`;
                  navigator.clipboard?.writeText(url);
                  history.replaceState(null, "", `#${id}`);
                }}
                className="no-print ml-2 text-teal-500/40 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 group-[.reveal-actions]:opacity-100 hover:text-teal-500"
              >
                #
              </a>
              {contentItemId && (
                <ContentFeedbackButton
                  contentItemId={contentItemId}
                  sections={sections}
                  defaultSectionId={id}
                  variant="inline"
                  forceVisible={revealed}
                  alreadyReported={reportedSectionIds?.has(id)}
                />
              )}
            </h3>
          );
        },
        sup: ({ children, ...rest }) => <sup {...rest}>{children}</sup>,
        // Markdown wraps a standalone image in a paragraph, but we render images as <figure>
        // (interactive diagram or lightbox), and a <figure> inside a <p> is invalid HTML — the
        // browser closes the <p> early, so the server and client trees diverge and hydration
        // fails, leaving the whole diagram inert. Unwrap those paragraphs to a <div>.
        // Test the mdast node, not React children: `children` here are our own custom renderers,
        // never a literal "img" element.
        p: ({ children, node }) => {
          const holdsImage = node?.children?.some(
            (child) => child.type === "element" && child.tagName === "img",
          );
          return holdsImage ? <div>{children}</div> : <p>{children}</p>;
        },
        a: ({ href, children, ...rest }) => {
          if (href?.startsWith("#src-")) {
            const n = Number(href.slice("#src-".length));
            return (
              <CitationMark href={href} citation={citations[n - 1]}>
                {children}
              </CitationMark>
            );
          }
          return (
            <a href={href} {...rest}>
              {children}
            </a>
          );
        },
        blockquote: ({ children }) => <Callout>{children}</Callout>,
        img: ({ src, alt }) => {
          const base =
            String(src ?? "")
              .split("/")
              .pop() ?? "";
          const caption = captionByFile.get(base) || alt;
          const figureIndex = figureIndexByFile.get(base);
          const authored = getAuthoredDiagram(base);
          const svgMarkup = getStaticDiagramSvg(base);
          const resolvedSrc = srcByFile.get(base) ?? authored?.staticPath ?? (src as string);
          return (
            <DiagramLightbox
              src={resolvedSrc}
              alt={alt ?? ""}
              caption={caption}
              figureIndex={figureIndex}
              svgMarkup={authored && svgMarkup ? svgMarkup : undefined}
              definition={authored}
              citations={citations}
            />
          );
        },
      }) satisfies ComponentProps<typeof ReactMarkdown>["components"],
    [
      captionByFile,
      srcByFile,
      figureIndexByFile,
      citations,
      contentItemId,
      sections,
      tapRevealedId,
      reportedSectionIds,
    ],
  );

  return (
    <div
      className="article-body prose dark:prose-invert prose-lg lg:prose-xl mt-8 max-w-none prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-16 prose-h2:border-b prose-h2:border-border prose-h2:pb-2 prose-h2:text-2xl prose-h3:mt-10 prose-h3:text-xl prose-p:leading-relaxed prose-a:text-teal-600 dark:prose-a:text-teal-300 prose-strong:text-foreground prose-li:marker:text-teal-500 dark:prose-li:marker:text-teal-400"
      data-archetype={archetype}
      data-density={density}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        urlTransform={(url) =>
          url.startsWith("/content/diagrams/")
            ? url.replace("/content/diagrams/", "/diagrams/")
            : url
        }
        components={components}
      >
        {renderedBody}
      </ReactMarkdown>
    </div>
  );
}
