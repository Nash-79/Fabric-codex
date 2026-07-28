import { ArrowRight, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { AuthoredDiagramNode, DiagramDrillTarget, DiagramLayer } from "@/diagrams/types";
import type { Citation } from "@/components/CitationSidebar";
import { isAuthored } from "@/diagrams/catalog";
import { DiagramLegend } from "@/components/DiagramLegend";
import { cn } from "@/lib/utils";

// Renders a node's full authored detail — the persistent-selection counterpart to AuthoredSvg's
// hover tooltip (which stays capped at 3 evidence items by design; this panel shows all of them).
export function DiagramDetailPanel({
  node,
  citations = [],
  legendNodes,
  activeLayerFilter,
  onToggleLayerFilter,
  onClose,
  onNavigateToDiagram,
  variant,
}: {
  node: AuthoredDiagramNode | null;
  citations?: Citation[];
  legendNodes: AuthoredDiagramNode[];
  activeLayerFilter: Set<DiagramLayer> | null;
  onToggleLayerFilter: (layer: DiagramLayer) => void;
  onClose: () => void;
  onNavigateToDiagram?: (slug: string) => void;
  variant: "side" | "stacked";
}) {
  const citationByKey = new Map(
    citations.flatMap((citation) => {
      const key = citation.source?.source_key ?? citation.source?.slug;
      return key ? [[key, citation] as const] : [];
    }),
  );

  const distinctLayers = new Set(legendNodes.flatMap((n) => n.layers));
  const distinctClassifications = new Set(legendNodes.map((n) => n.classification));
  const showLegend = distinctLayers.size >= 2 || distinctClassifications.size >= 2;

  return (
    <div
      className={cn(
        "text-sm",
        variant === "side"
          ? "sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-border bg-card/95 p-4 shadow-sm"
          : "rounded-xl border border-border bg-card/95 p-4 shadow-sm",
      )}
    >
      {!node ? (
        showLegend ? (
          <DiagramLegend
            nodes={legendNodes}
            activeLayerFilter={activeLayerFilter}
            onToggleLayer={onToggleLayerFilter}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            Select a region of the diagram to see its detail.
          </p>
        )
      ) : (
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <strong className="text-sm leading-snug text-foreground">{node.label}</strong>
              <span className="shrink-0 rounded-full border border-border bg-muted/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {node.classification}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail panel"
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{node.summary}</p>

          {node.whyItMatters && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Why it matters
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {node.whyItMatters}
              </p>
            </div>
          )}

          {node.detail && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Detail
              </div>
              <p
                className={cn(
                  "mt-1 text-xs leading-relaxed text-muted-foreground",
                  variant === "stacked" && "max-h-[40vh] overflow-y-auto",
                )}
              >
                {node.detail}
              </p>
            </div>
          )}

          {node.evidence.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Evidence
              </div>
              <ul className="mt-1.5 space-y-1">
                {node.evidence.map((evidence, index) => {
                  const citation = citationByKey.get(evidence.sourceKey);
                  const contents = (
                    <>
                      <span className="font-mono font-semibold">{evidence.sourceKey}</span>
                      <span className="sr-only">: </span>
                      <span className="ml-1 text-muted-foreground">{evidence.note}</span>
                    </>
                  );
                  return (
                    <li key={`${evidence.sourceKey}-${index}`} className="text-[11px] leading-snug">
                      {citation?.source?.url ? (
                        <a
                          href={citation.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal-700 hover:underline dark:text-teal-300"
                        >
                          {contents}
                        </a>
                      ) : (
                        contents
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-3 border-t border-border pt-3">
            <div
              className={cn("grid gap-3", variant === "stacked" ? "grid-cols-1" : "grid-cols-3")}
            >
              <DrillColumn label="Inputs" items={node.drill.inputs} />
              <DrillConnector variant={variant} />
              <DrillColumn label="Processing" items={node.drill.processing} />
              <DrillConnector variant={variant} />
              <DrillColumn label="Outputs" items={node.drill.outputs} />
            </div>
          </div>

          {node.drill.example && (
            <div className="mt-3 rounded-xl border border-teal-500/30 bg-teal-500/5 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                Worked example
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {node.drill.example}
              </p>
            </div>
          )}

          {node.drill.controls.length > 0 && (
            <DrillList label="Controls" items={node.drill.controls} />
          )}
          {node.drill.failureModes.length > 0 && (
            <DrillList label="Failure modes" items={node.drill.failureModes} />
          )}

          {node.drill.metrics && node.drill.metrics.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Metrics
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {node.drill.metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-lg border border-border bg-muted/30 p-2"
                  >
                    <div className="text-sm font-semibold text-foreground">{metric.value}</div>
                    <div className="text-[10px] text-muted-foreground">{metric.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {node.drillTarget && (
            <div className="mt-3 border-t border-border pt-3">
              <DrillTargetLink
                target={node.drillTarget}
                onNavigateToDiagram={onNavigateToDiagram}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DrillColumn({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DrillConnector({ variant }: { variant: "side" | "stacked" }) {
  return (
    <div className="flex items-center justify-center text-muted-foreground/50" aria-hidden="true">
      {variant === "stacked" ? "↓" : "→"}
    </div>
  );
}

function DrillList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

// Switches on drillTarget.kind, mirroring ArticleBreadcrumb.tsx's per-kind if-chain idiom rather
// than a shared generic "kind -> path" helper (none exists in the codebase today).
function DrillTargetLink({
  target,
  onNavigateToDiagram,
}: {
  target: DiagramDrillTarget;
  onNavigateToDiagram?: (slug: string) => void;
}) {
  const linkClass =
    "inline-flex items-center gap-1.5 text-xs text-teal-600 hover:underline dark:text-teal-300";

  if (target.kind === "topic") {
    return (
      <Link to="/topics/$slug" params={{ slug: target.slug }} className={linkClass}>
        <ArrowRight className="h-3.5 w-3.5" />
        {target.label}
      </Link>
    );
  }
  if (target.kind === "capability") {
    return (
      <Link to="/registry/$id" params={{ id: target.slug }} className={linkClass}>
        <ArrowRight className="h-3.5 w-3.5" />
        {target.label}
      </Link>
    );
  }
  if (target.kind === "article" || target.kind === "design" || target.kind === "lesson") {
    return (
      <Link
        to="/blogs/$kind/$slug"
        params={{ kind: target.kind, slug: target.slug }}
        className={linkClass}
      >
        <ArrowRight className="h-3.5 w-3.5" />
        {target.label}
      </Link>
    );
  }
  // target.kind === "diagram" — no dedicated detail route exists; if the target is a real
  // registered diagram, jump to it inline within the same interactive surface. Otherwise
  // (a broken/typo'd reference) fall back to inert text.
  if (isAuthored(target.slug) && onNavigateToDiagram) {
    return (
      <button type="button" onClick={() => onNavigateToDiagram(target.slug)} className={linkClass}>
        <ArrowRight className="h-3.5 w-3.5" />
        {target.label}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <ArrowRight className="h-3.5 w-3.5" />
      {target.label}
    </span>
  );
}
