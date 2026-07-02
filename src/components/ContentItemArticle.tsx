import { useMemo, type ComponentType, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import { ExternalLink } from "lucide-react";
import { markdownPanels } from "@/components/MarkdownPanels";
import { Callout } from "@/components/Callout";
import { DiagramLightbox } from "@/components/DiagramLightbox";
import { AdvisorMermaidBlock } from "@/components/AdvisorMermaidBlock";
import { TierBadge } from "@/components/Badges";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { Citation } from "@/components/CitationSidebar";
import { slugifyHeading, textFromNode } from "@/lib/heading-utils";
import { codeLanguage } from "@/components/CodeBlock";

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
}: {
  bodyMd: string;
  diagramMeta?: DiagramMeta[];
  citations?: Citation[];
}) {
  const captionByFile = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of diagramMeta) {
      const base = (d.path ?? "").split("/").pop();
      if (base && d.caption) map.set(base, d.caption);
    }
    return map;
  }, [diagramMeta]);

  // Replace [S1] / [S1][S2] inline citations with clickable superscripts.
  const renderedBody = bodyMd.replace(
    /\[S(\d+)\]/g,
    (_m: string, n: string) =>
      ` <sup id="cite-${n}"><a href="#src-${n}" class="cite">[S${n}]</a></sup>`,
  );

  return (
    <div className="prose dark:prose-invert prose-lg lg:prose-xl mt-8 max-w-none prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-16 prose-h2:border-b prose-h2:border-border prose-h2:pb-2 prose-h2:text-2xl prose-h3:mt-10 prose-h3:text-xl prose-p:leading-relaxed prose-a:text-teal-600 dark:prose-a:text-teal-300 prose-strong:text-foreground prose-li:marker:text-teal-500 dark:prose-li:marker:text-teal-400">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        urlTransform={(url) =>
          url.startsWith("/content/diagrams/")
            ? url.replace("/content/diagrams/", "/diagrams/")
            : url
        }
        components={{
          ...markdownPanels,
          // ```mermaid fences render as live diagrams (zoomable, copyable source) instead of a
          // syntax-highlighted code panel — same renderer the Advisor uses.
          pre: ({ children }) => {
            if (codeLanguage(children) === "mermaid") {
              return <AdvisorMermaidBlock code={textFromNode(children)} />;
            }
            const PanelPre = markdownPanels.pre as ComponentType<{ children?: ReactNode }>;
            return <PanelPre>{children}</PanelPre>;
          },
          h2: ({ children, ...rest }) => {
            // textFromNode, not String(children): a heading with inline code or a link
            // stringifies as "[object Object]" and every ToC anchor to it goes dead.
            const id = slugifyHeading(textFromNode(children));
            return (
              <h2 id={id} {...rest} className="relative pl-4">
                <span
                  className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-teal-400"
                  aria-hidden="true"
                />
                {children}
              </h2>
            );
          },
          sup: ({ children, ...rest }) => <sup {...rest}>{children}</sup>,
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
            return <DiagramLightbox src={src as string} alt={alt ?? ""} caption={caption} />;
          },
        }}
      >
        {renderedBody}
      </ReactMarkdown>
    </div>
  );
}
