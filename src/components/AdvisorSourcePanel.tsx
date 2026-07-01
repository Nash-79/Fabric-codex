import { ExternalLink, FileText, Layers, Network, ShieldCheck } from "lucide-react";
import type { AdvisorContextSource } from "@/lib/advisor-types";

const KIND_LABEL: Record<AdvisorContextSource["kind"], string> = {
  claim: "Claim",
  source: "Source",
  content: "Blog",
  topic: "Topic",
  capability: "Capability",
  diagram: "Diagram",
};

const KIND_ICON: Record<AdvisorContextSource["kind"], typeof ShieldCheck> = {
  claim: ShieldCheck,
  source: FileText,
  content: FileText,
  topic: Network,
  capability: Layers,
  diagram: Layers,
};

export function AdvisorSourcePanel({
  sources,
  summary,
  open,
  onOpenChange,
}: {
  sources: AdvisorContextSource[];
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <aside
      className={`border-l border-border bg-card/60 lg:block ${open ? "block" : "hidden"}`}
      aria-label="Advisor sources and retrieved context"
    >
      <div className="sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Sources & context</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {summary || "Ask a question to see retrieved claims, blogs, sources, and topics."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring lg:hidden"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {sources.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              Retrieved context will appear here while the Advisor answers.
            </div>
          ) : (
            sources.map((source) => {
              const Icon = KIND_ICON[source.kind];
              const body = (
                <div className="rounded-md border border-border bg-background p-3 transition hover:bg-accent">
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          {source.label}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {KIND_LABEL[source.kind]}
                        </span>
                        {source.tier != null && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            T{source.tier}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 line-clamp-2 text-sm font-medium text-foreground">
                        {source.title}
                      </div>
                      {source.summary && (
                        <div className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                          {source.summary}
                        </div>
                      )}
                    </div>
                    {source.url && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                </div>
              );

              return source.url ? (
                <a
                  key={source.id}
                  href={source.url}
                  target={source.url.startsWith("http") ? "_blank" : undefined}
                  rel={source.url.startsWith("http") ? "noreferrer" : undefined}
                  className="block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {body}
                </a>
              ) : (
                <div key={source.id}>{body}</div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
