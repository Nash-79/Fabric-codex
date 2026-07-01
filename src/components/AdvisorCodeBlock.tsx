import { Check, Copy } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

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

function textFromNode(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join("");
  if (typeof node === "object" && "props" in node) {
    return textFromNode((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

export function AdvisorCodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const lang = codeLanguage(children) || "code";
  const code = useMemo(() => textFromNode(children), [children]);

  async function copyCode() {
    if (!navigator?.clipboard) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="not-prose my-4 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {lang}
        </span>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Copy code block"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-sm leading-relaxed [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    </div>
  );
}
