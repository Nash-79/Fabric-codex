import type { ReactNode } from "react";
import type { Components } from "react-markdown";

// Shared ReactMarkdown component overrides for article bodies (blogs + designs).
// They give fenced code a bordered panel with a language chip (highlight.js colours the
// tokens), inline code a subtle pill, and markdown tables real borders/spacing — the brand
// look that the bare `prose` defaults don't cover.

// Render a fenced code block as a bordered panel with a small language chip. highlight.js
// (via rehype-highlight) colours the tokens inside the inner <code>; we only own the chrome.
function CodeBlock({ children }: { children: ReactNode }) {
  const lang = codeLanguage(children);
  return (
    <div className="not-prose my-6 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {lang || "code"}
        </span>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-sm leading-relaxed [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    </div>
  );
}

// Pull the fenced language ("sql", "python", …) off the inner <code className="language-xxx">.
function codeLanguage(node: ReactNode): string {
  if (node && typeof node === "object" && "props" in node) {
    const cls = String((node as { props?: { className?: string } }).props?.className ?? "");
    const match = cls.match(/language-([a-z0-9+#-]+)/i);
    if (match) return match[1];
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const lang = codeLanguage(child);
      if (lang) return lang;
    }
  }
  return "";
}

// Code, table, and heading renderers shared by the blog and design article views. Spread into
// a ReactMarkdown `components` map; route-specific overrides (links, images, callouts) layer on.
export const markdownPanels: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
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
