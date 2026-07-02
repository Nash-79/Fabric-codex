import type { ReactNode } from "react";

// Shared heading-anchor rules. The article body (ContentItemArticle) derives each h2's id from
// its rendered children, while the ToC sidebar (useTocHeadings) derives ids from the raw
// markdown source — both sides MUST use these helpers or anchors drift apart the moment a
// heading contains inline code, a link, or emphasis.

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Recursively flatten a rendered ReactNode tree to its text. `String(children)` yields
// "[object Object]" for headings with inline elements — this walks them instead.
export function textFromNode(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join("");
  if (typeof node === "object" && "props" in node) {
    return textFromNode((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

// Reduce a raw markdown heading line to the text the reader actually sees, so slugs from the
// markdown source match slugs from the rendered DOM: [label](url) → label, ![alt](url) → alt,
// `code` → code, **bold**/*em*/~~strike~~ markers dropped.
export function stripMarkdownInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .trim();
}
