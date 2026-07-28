import { Check, Copy, WrapText } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { textFromNode } from "@/lib/heading-utils";
import { parseCodeMeta } from "@/lib/code-meta";

// Pull the fenced language ("sql", "python", …) off the inner <code className="language-xxx">.
export function codeLanguage(node: ReactNode): string {
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

type HastNode = { children?: Array<{ data?: { meta?: string } }> };

// The one fenced-code panel for the whole app — articles, designs, lessons, and the Advisor all
// render this: bordered panel, title/language chip, copy-to-clipboard, wrap toggle, highlighted
// lines. highlight.js (via rehype-highlight) colours the tokens inside the inner <code>; this
// component only owns the chrome and never touches that already-tokenized tree, so raw code stays
// intact for copy and syntax highlighting.
export function CodeBlock({ children, node }: { children: ReactNode; node?: HastNode }) {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const lang = codeLanguage(children) || "code";
  const code = useMemo(() => textFromNode(children), [children]);
  // The meta string lives on the inner <code> hast node (mdast-util-to-hast's code handler sets
  // it there before wrapping in <pre>), so from <pre>'s node prop it's one level down.
  const meta = useMemo(() => parseCodeMeta(node?.children?.[0]?.data?.meta), [node]);
  const lineCount = useMemo(() => code.split("\n").length, [code]);
  const displayTitle = meta.title ?? lang;

  async function copyCode() {
    if (!navigator?.clipboard) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div
      className="not-prose my-6 overflow-hidden rounded-xl border shadow-sm"
      style={{
        backgroundColor: "var(--surface-code-bg)",
        borderColor: "var(--surface-code-border)",
      }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b border-border px-3 py-2"
        style={{ backgroundColor: "var(--surface-code-header-bg)" }}
      >
        <span className="flex min-w-0 items-center gap-2">
          {meta.title ? (
            <>
              <span className="truncate text-xs font-semibold text-foreground">{meta.title}</span>
              <span
                className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                style={{
                  borderColor: "color-mix(in oklab, var(--surface-code-accent) 30%, transparent)",
                  color: "var(--surface-code-accent)",
                }}
              >
                {lang}
              </span>
            </>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
              {lang}
            </span>
          )}
          <span className="hidden text-[10px] text-muted-foreground sm:inline">
            {lineCount} line{lineCount === 1 ? "" : "s"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setWrapped((w) => !w)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={wrapped ? "Switch to scroll mode" : "Switch to wrap mode"}
            aria-pressed={wrapped}
          >
            <WrapText className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={copyCode}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Copy code block"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </span>
      </div>
      <div className="relative" aria-label={`Code: ${displayTitle}`}>
        {meta.highlightLines.size > 0 && (
          <div className="pointer-events-none absolute inset-0 py-3" aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => i + 1).map((line) =>
              meta.highlightLines.has(line) ? (
                <div
                  key={line}
                  className="absolute inset-x-0 bg-teal-500/10"
                  style={{ top: `${(line - 1) * 1.625}em`, height: "1.625em" }}
                />
              ) : null,
            )}
          </div>
        )}
        <pre
          className={`relative max-h-[min(34rem,72vh)] px-4 py-4 text-sm leading-relaxed [tab-size:2] [&_code]:bg-transparent [&_code]:p-0 ${
            wrapped ? "whitespace-pre-wrap break-words" : "overflow-x-auto"
          }`}
        >
          {children}
        </pre>
      </div>
    </div>
  );
}
