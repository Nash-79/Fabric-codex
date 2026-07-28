import type { Components } from "react-markdown";
import { CodeBlock } from "@/components/CodeBlock";

// Shared ReactMarkdown component overrides for article bodies (blogs + designs).
// They give fenced code the shared CodeBlock panel (language chip + copy button; highlight.js
// colours the tokens), inline code a subtle pill, and markdown tables real borders/spacing —
// the brand look that the bare `prose` defaults don't cover.

// Code, table, and heading renderers shared by the blog and design article views. Spread into
// a ReactMarkdown `components` map; route-specific overrides (links, images, callouts) layer on.
export const markdownPanels: Components = {
  pre: ({ children, node }) => <CodeBlock node={node as never}>{children}</CodeBlock>,
  code: ({ className, children, ...rest }) => {
    // Block code (inside <pre>) carries a `language-*` class — leave it for the CodeBlock
    // wrapper + highlight.js. Inline code gets a subtle pill.
    if (className?.includes("language-")) {
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="not-prose my-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border px-4 py-2 text-left font-semibold text-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/60 px-4 py-2 align-top text-muted-foreground">
      {children}
    </td>
  ),
};
