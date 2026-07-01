import { Check, Copy, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import type { AdvisorMessage as AdvisorMessageType } from "@/lib/advisor-types";
import { AdvisorCodeBlock } from "@/components/AdvisorCodeBlock";
import { advisorMessageText } from "@/lib/advisor-message";

export function AdvisorMessage({
  message,
  isLastAssistant,
  onRetry,
}: {
  message: AdvisorMessageType;
  isLastAssistant: boolean;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => advisorMessageText(message), [message]);
  const mine = message.role === "user";

  async function copyMessage() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <article
      className={`group flex gap-3 ${mine ? "justify-end" : "justify-start"}`}
      aria-label={mine ? "Your message" : "Advisor response"}
    >
      <div className={`min-w-0 ${mine ? "max-w-[86%]" : "w-full max-w-3xl"}`}>
        <div
          className={
            mine
              ? "rounded-lg bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground"
              : "rounded-lg border border-border bg-card px-4 py-4 text-sm leading-relaxed text-foreground shadow-sm"
          }
        >
          {mine ? (
            <p className="whitespace-pre-wrap">{text}</p>
          ) : (
            <div
              className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-p:my-2 prose-a:text-primary prose-strong:text-foreground prose-li:my-0.5"
              aria-live={isLastAssistant ? "polite" : undefined}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
                components={{
                  pre: ({ children }) => <AdvisorCodeBlock>{children}</AdvisorCodeBlock>,
                  code: ({ className, children, ...rest }) => {
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
                    <div className="not-prose my-4 overflow-x-auto rounded-lg border border-border">
                      <table className="w-full border-collapse text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
                  th: ({ children }) => (
                    <th className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border-b border-border/60 px-3 py-2 align-top text-muted-foreground">
                      {children}
                    </td>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="not-prose my-4 rounded-lg border-l-4 border-primary bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children, ...rest }) => (
                    <a
                      href={href}
                      target={href?.startsWith("http") ? "_blank" : undefined}
                      rel={href?.startsWith("http") ? "noreferrer" : undefined}
                      {...rest}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {text || "…"}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {!mine && (
          <div className="mt-2 flex items-center gap-1 opacity-100 md:opacity-0 md:transition group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              onClick={copyMessage}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Copy Advisor response"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            {isLastAssistant && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Regenerate Advisor response"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
