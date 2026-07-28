import type { AuthoredDiagramNode, DiagramLayer } from "@/diagrams/types";
import { cn } from "@/lib/utils";

// Small local color map — DiagramLayer's 7 values don't overlap fabric-theme.ts's Accent union
// (teal/indigo/amber/yellow/violet/rose, used for capability accents), so reusing that palette
// would be an arbitrary re-mapping with no semantic connection.
const LAYER_DOT_CLASS: Record<DiagramLayer, string> = {
  data: "bg-teal-400",
  compute: "bg-indigo-400",
  governance: "bg-violet-400",
  security: "bg-rose-400",
  metadata: "bg-amber-400",
  orchestration: "bg-sky-400",
  observability: "bg-lime-400",
};

const LAYER_LABEL: Record<DiagramLayer, string> = {
  data: "Data",
  compute: "Compute",
  governance: "Governance",
  security: "Security",
  metadata: "Metadata",
  orchestration: "Orchestration",
  observability: "Observability",
};

// Only rendered by the caller when the diagram actually has 2+ distinct layers or 2+ distinct
// classifications present — a single-layer/single-classification diagram gets no legend, per
// goal 4's "only where sidecar data supports them."
export function DiagramLegend({
  nodes,
  activeLayerFilter,
  onToggleLayer,
}: {
  nodes: AuthoredDiagramNode[];
  activeLayerFilter: Set<DiagramLayer> | null;
  onToggleLayer: (layer: DiagramLayer) => void;
}) {
  const distinctLayers = [...new Set(nodes.flatMap((n) => n.layers))];
  const distinctClassifications = [...new Set(nodes.map((n) => n.classification))];

  return (
    <div className="space-y-3 text-xs">
      {distinctClassifications.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Classification
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {distinctClassifications.map((classification) => (
              <span
                key={classification}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {classification}
              </span>
            ))}
          </div>
        </div>
      )}
      {distinctLayers.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Layers{distinctLayers.length >= 2 ? " — click to filter" : ""}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {distinctLayers.map((layer) => {
              const active = activeLayerFilter?.has(layer) ?? false;
              const filtering = Boolean(activeLayerFilter?.size);
              return (
                <button
                  key={layer}
                  type="button"
                  onClick={() => onToggleLayer(layer)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition",
                    active || !filtering
                      ? "border-border bg-card text-foreground"
                      : "border-border/50 bg-transparent text-muted-foreground/60",
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", LAYER_DOT_CLASS[layer])} />
                  {LAYER_LABEL[layer]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
