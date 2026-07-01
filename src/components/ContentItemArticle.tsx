import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import { markdownPanels } from "@/components/MarkdownPanels";
import { Callout } from "@/components/Callout";
import { DiagramLightbox } from "@/components/DiagramLightbox";

type DiagramMeta = { path?: string; caption?: string };

// Shared markdown body renderer for the unified content detail route (article/design/lesson).
// Extracted from blog.$slug.tsx (the richer of the two prior renderers — h2 anchor ids, image
// captions from the diagrams table, sup-wrapped inline citations, [!NOTE]-style callouts) so all
// three kinds get the same treatment. Previously only blogs had callouts and image captions;
// designs rendered plain blockquotes and uncaptioned images.
export function ContentItemArticle({
  bodyMd,
  diagramMeta = [],
}: {
  bodyMd: string;
  diagramMeta?: DiagramMeta[];
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
    <div className="prose prose-invert prose-lg lg:prose-xl mt-8 max-w-none prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-16 prose-h2:border-b prose-h2:border-border prose-h2:pb-2 prose-h2:text-2xl prose-h3:mt-10 prose-h3:text-xl prose-p:leading-relaxed prose-a:text-teal-300 prose-strong:text-foreground prose-li:marker:text-teal-400">
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
          h2: ({ children, ...rest }) => {
            const text = String(children);
            const id = text
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "");
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
