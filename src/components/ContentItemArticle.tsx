import {
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import { all, common } from "lowlight";
import { ExternalLink } from "lucide-react";
import { markdownPanels } from "@/components/MarkdownPanels";
import { Callout } from "@/components/Callout";
import { DiagramLightbox } from "@/components/DiagramLightbox";
import { isAuthored, loadAuthoredDiagram } from "@/diagrams/catalog";
import type { AuthoredDiagram } from "@/diagrams/types";
import { AdvisorMermaidBlock } from "@/components/AdvisorMermaidBlock";
import { TierBadge } from "@/components/Badges";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { Citation } from "@/components/CitationSidebar";
import { slugifyHeading, textFromNode } from "@/lib/heading-utils";
import { codeLanguage } from "@/components/CodeBlock";
import { ContentFeedbackButton } from "@/components/ContentFeedbackButton";
import type { TocEntry } from "@/components/ContentTocSidebar";
import type { PresentationArchetype, ReadingDensity } from "@/lib/content-presentation";
import { StepSequence } from "@/components/StepSequence";
import { CodeGroup } from "@/components/CodeGroup";
import { parseCodeMeta, isOutputBlock } from "@/lib/code-meta";

// rehype-highlight defaults to lowlight's `common` bundle (37 languages, eagerly evaluated —
// unlike @streamdown/code's Shiki highlighter used in the Advisor chat, which lazy-loads one
// grammar chunk per language on demand). Narrowed to what article/lesson/design body_md actually
// fences (measured via a corpus scan across content/{articles,lessons,designs}); KQL/DAX aren't
// highlight.js-supported grammars at all, so `detect: true` already falls back to plaintext for
// them with or without this list. `http` isn't in `common` (only in `all`) — pulling it from
// `common` silently sets `languages.http = undefined`, which crashed rehype-highlight with
// "Cannot read properties of undefined (reading 'bind')" on the one article with a ```http fence.
const HIGHLIGHT_LANGUAGES = {
  bash: common.bash,
  csharp: common.csharp,
  graphql: common.graphql,
  http: all.http,
  json: common.json,
  python: common.python,
  sql: common.sql,
  yaml: common.yaml,
};

// Wraps runs of consecutive `> [!STEP]` blockquotes in <div data-step-sequence data-section="..">
// and runs of consecutive fenced code blocks that carry a grouping meta tag in
// <div data-code-group data-titles="...">, both BEFORE ReactMarkdown parses the body — the same
// "regex the raw string, let rehypeRaw carry the wrapper through" idiom already used for [S1]
// citations and figure indexing in this file. Grouping can't happen inside a per-node component
// override (ReactMarkdown calls `blockquote`/`pre` independently per node, with no
// sibling-awareness), so it has to happen once, on the string, before individual nodes render.
export function wrapTeachingPrimitiveRuns(bodyMd: string): string {
  const lines = bodyMd.split("\n");
  const out: string[] = [];
  let currentSectionSlug = "intro";
  let stepRunCounter = 0;
  let i = 0;

  const isBlank = (line: string) => line.trim() === "";
  const isQuoteLine = (line: string) => /^\s*>/.test(line);
  const isFenceLine = (line: string) => /^```/.test(line.trim());

  while (i < lines.length) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{2,3})\s+(.+)$/);
    if (headingMatch) {
      currentSectionSlug = slugifyHeading(headingMatch[2]);
      out.push(line);
      i += 1;
      continue;
    }

    // A run of consecutive `> [!STEP]` blockquote blocks (blank-line separated) starting here.
    if (isQuoteLine(line) && /^\s*>\s*\[!STEP\]/i.test(line)) {
      const runLines: string[] = [];
      while (i < lines.length) {
        // Consume one blockquote block.
        if (!isQuoteLine(lines[i])) break;
        const blockStartsStep = /^\s*>\s*\[!STEP\]/i.test(lines[i]);
        if (!blockStartsStep) break;
        while (i < lines.length && isQuoteLine(lines[i])) {
          runLines.push(lines[i]);
          i += 1;
        }
        // A single blank line between blockquote blocks continues the run; two or more, or a
        // non-blockquote non-blank line, ends it.
        if (i < lines.length && isBlank(lines[i]) && isQuoteLine(lines[i + 1] ?? "")) {
          runLines.push(lines[i]);
          i += 1;
        } else {
          break;
        }
      }
      stepRunCounter += 1;
      out.push(
        `<div data-step-sequence="${stepRunCounter}" data-section="${currentSectionSlug}">`,
        "",
        ...runLines,
        "",
        "</div>",
        "",
      );
      continue;
    }

    // A run of consecutive fenced code blocks (blank-line separated) where at least one carries
    // a grouping-relevant meta tag (data-output, or 2+ blocks each with a distinct title=).
    if (isFenceLine(line)) {
      const blockStarts: number[] = [i];
      const blockEnds: number[] = [];
      let cursor = i;
      let closed = false;
      while (cursor < lines.length) {
        if (cursor !== i && isFenceLine(lines[cursor])) {
          closed = true;
          blockEnds.push(cursor);
          cursor += 1;
          break;
        }
        cursor += 1;
      }
      if (!closed) {
        out.push(line);
        i += 1;
        continue;
      }
      // Keep consuming further fenced blocks separated by exactly one blank line.
      while (
        cursor < lines.length &&
        isBlank(lines[cursor]) &&
        isFenceLine(lines[cursor + 1] ?? "")
      ) {
        const nextStart = cursor + 1;
        let inner = nextStart + 1;
        let innerClosed = false;
        while (inner < lines.length) {
          if (isFenceLine(lines[inner])) {
            innerClosed = true;
            break;
          }
          inner += 1;
        }
        if (!innerClosed) break;
        blockStarts.push(nextStart);
        blockEnds.push(inner);
        cursor = inner + 1;
      }

      if (blockStarts.length >= 2) {
        const metas = blockStarts.map((start) => {
          const metaText = lines[start].replace(/^```[a-z0-9+#-]*\s*/i, "");
          return parseCodeMeta(metaText);
        });
        const outputIdx = blockStarts.findIndex((start) =>
          isOutputBlock(lines[start].replace(/^```[a-z0-9+#-]*\s*/i, "")),
        );
        const distinctTitles = new Set(metas.map((m) => m.title).filter(Boolean));
        const shouldGroup = outputIdx >= 0 || distinctTitles.size >= 2;
        if (shouldGroup) {
          const titlesAttr = metas.map((m) => m.title ?? "").join("|||");
          const lastEnd = blockEnds[blockEnds.length - 1];
          out.push(
            `<div data-code-group data-titles="${titlesAttr}"${
              outputIdx >= 0 ? ` data-output-index="${outputIdx}"` : ""
            }>`,
            "",
            ...lines.slice(i, lastEnd + 1),
            "",
            "</div>",
            "",
          );
          i = lastEnd + 1;
          continue;
        }
      }
      // No grouping applies — emit the single fenced block untouched.
      out.push(...lines.slice(i, blockEnds[0] + 1));
      i = blockEnds[0] + 1;
      continue;
    }

    out.push(line);
    i += 1;
  }

  return out.join("\n");
}

type DiagramMeta = { path?: string; caption?: string };

// Renders a single `> [!STEP] Title` blockquote's body as a step card's content: the text
// immediately after the marker (up to the first line break within the blockquote) becomes the
// step title, the rest is the step body. Reuses Callout.tsx's walk-and-strip technique rather
// than introducing a second parsing approach.
function StepCard({ children }: { children: ReactNode }) {
  const fullText = textFromNode(children);
  const match = fullText.match(/^\s*\[!STEP\]\s*(.*)$/);
  const title = match?.[1]?.trim();
  return (
    <div>
      {title && <div className="font-semibold text-foreground">{title}</div>}
      <div className="mt-1 text-sm text-muted-foreground [&_p]:m-0">
        {stripStepMarker(children, title)}
      </div>
    </div>
  );
}

// Removes the leading "[!STEP] Title" text (marker + extracted title, both on the blockquote's
// first line) from the rendered children, leaving only the step body — mirrors Callout.tsx's
// stripMarker, generalized to also drop the title text since it's rendered separately above.
function stripStepMarker(children: ReactNode, title: string | undefined): ReactNode {
  const markerPrefix = title ? `[!STEP] ${title}` : "[!STEP]";
  let removed = false;
  const walk = (n: ReactNode): ReactNode => {
    if (removed) return n;
    if (typeof n === "string") {
      if (n.includes(markerPrefix)) {
        removed = true;
        return n.replace(markerPrefix, "");
      }
      if (n.includes("[!STEP]")) {
        removed = true;
        return n.replace("[!STEP]", "");
      }
      return n;
    }
    if (Array.isArray(n)) return n.map(walk);
    if (n && typeof n === "object" && "props" in (n as { props?: unknown })) {
      const el = n as ReactElement<{ children?: ReactNode }>;
      return { ...el, props: { ...el.props, children: walk(el.props?.children) } };
    }
    return n;
  };
  return walk(children);
}

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
  kind,
  slug,
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
  /** Used to key step-completion localStorage state (fa:steps:${kind}:${slug}) — see StepSequence. */
  kind?: string;
  slug?: string;
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

  // Replace [S1] / [S1][S2] inline citations with clickable superscripts, then group any
  // authored step sequences / code-block runs into raw wrapper divs rehypeRaw carries through.
  const renderedBody = wrapTeachingPrimitiveRuns(
    bodyMd.replace(
      /\[S(\d+)\]/g,
      (_m: string, n: string) =>
        ` <sup id="cite-${n}"><a href="#src-${n}" class="cite">[S${n}]</a></sup>`,
    ),
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

  // The authored diagram catalog is loaded lazily per-slug (see src/diagrams/catalog.ts) rather
  // than bundled eagerly — the full set was 4.16 MB of SVG + sidecar source shipped to every
  // article page for one diagram. Only the diagrams this article's body actually references are
  // fetched, keyed by filename so the img renderer below can read them back synchronously.
  const referencedDiagramFiles = useMemo(() => {
    const files = new Set<string>();
    for (const match of bodyMd.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const base = match[1]?.split("/").pop();
      if (base && isAuthored(base)) files.add(base);
    }
    return files;
  }, [bodyMd]);

  const [loadedDiagrams, setLoadedDiagrams] = useState<
    Map<string, { definition: AuthoredDiagram; markup: string }>
  >(new Map());

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      [...referencedDiagramFiles].map(async (file) => {
        const loaded = await loadAuthoredDiagram(file);
        return [file, loaded] as const;
      }),
    ).then((results) => {
      if (cancelled) return;
      setLoadedDiagrams((prev) => {
        const next = new Map(prev);
        for (const [file, loaded] of results) {
          if (loaded) next.set(file, loaded);
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [referencedDiagramFiles]);

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
        pre: ({ children, node }) => {
          if (codeLanguage(children) === "mermaid") {
            return <AdvisorMermaidBlock code={textFromNode(children)} />;
          }
          const PanelPre = markdownPanels.pre as ComponentType<{
            children?: ReactNode;
            node?: unknown;
          }>;
          return <PanelPre node={node}>{children}</PanelPre>;
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
        blockquote: ({ children }) => {
          const text = textFromNode(children);
          if (/^\s*\[!STEP\]/i.test(text)) {
            return <StepCard>{children}</StepCard>;
          }
          return <Callout>{children}</Callout>;
        },
        div: ({ children, node, ...rest }) => {
          const props = (node?.properties ?? {}) as Record<string, unknown>;
          if ("dataStepSequence" in props) {
            const sectionSlug = String(props.dataSection ?? "intro");
            return (
              <StepSequence sectionSlug={sectionSlug} kind={kind} slug={slug}>
                {children}
              </StepSequence>
            );
          }
          if ("dataCodeGroup" in props) {
            const titles = String(props.dataTitles ?? "")
              .split("|||")
              .map((t) => (t ? t : undefined));
            const outputIndexRaw = props.dataOutputIndex;
            const outputIndex = outputIndexRaw !== undefined ? Number(outputIndexRaw) : undefined;
            return (
              <CodeGroup titles={titles} outputIndex={outputIndex}>
                {children}
              </CodeGroup>
            );
          }
          return <div {...rest}>{children}</div>;
        },
        img: ({ src, alt }) => {
          const base =
            String(src ?? "")
              .split("/")
              .pop() ?? "";
          const caption = captionByFile.get(base) || alt;
          const figureIndex = figureIndexByFile.get(base);
          const loaded = loadedDiagrams.get(base);
          const authored = loaded?.definition;
          const svgMarkup = loaded?.markup;
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
      loadedDiagrams,
      citations,
      contentItemId,
      sections,
      tapRevealedId,
      reportedSectionIds,
      kind,
      slug,
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
        rehypePlugins={[
          rehypeRaw,
          [rehypeHighlight, { detect: true, ignoreMissing: true, languages: HIGHLIGHT_LANGUAGES }],
        ]}
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
