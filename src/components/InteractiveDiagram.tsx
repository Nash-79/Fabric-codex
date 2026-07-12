import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ExternalLink, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { drillHref, type DiagramLayer, type InteractiveDiagramDefinition } from "@/diagrams/types";

const layerLabels: Record<DiagramLayer, string> = {
  data: "Data",
  compute: "Compute",
  governance: "Governance",
  security: "Security",
  metadata: "Metadata",
  orchestration: "Orchestration",
  observability: "Observability",
};

const nodeColors = {
  fact: "#0f766e",
  pattern: "#6d28d9",
  inference: "#2563eb",
  warning: "#b45309",
};

function wrappedLines(text: string, max = 30) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function connectedIds(
  definition: InteractiveDiagramDefinition,
  start: string,
  direction: "up" | "down",
) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of definition.edges) {
      const next =
        direction === "down" && edge.from === current
          ? edge.to
          : direction === "up" && edge.to === current
            ? edge.from
            : undefined;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

export function InteractiveDiagram({
  definition,
  caption,
  figureIndex,
}: {
  definition: InteractiveDiagramDefinition;
  caption?: string;
  figureIndex?: number;
}) {
  const layers = useMemo(
    () => [...new Set(definition.nodes.flatMap((node) => node.layers))],
    [definition],
  );
  const [enabledLayers, setEnabledLayers] = useState(() => new Set(layers));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [trace, setTrace] = useState<"up" | "down" | null>(null);
  const [step, setStep] = useState(0);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const selected = definition.nodes.find((node) => node.id === selectedId) ?? null;
  const detailNode = definition.nodes.find((node) => node.id === detailNodeId) ?? null;
  const traced =
    selected && trace ? connectedIds(definition, selected.id, trace) : new Set<string>();
  const visible = (nodeId: string) => {
    const node = definition.nodes.find((candidate) => candidate.id === nodeId);
    return !!node?.layers.some((layer) => enabledLayers.has(layer));
  };
  const activeStep = definition.walkthrough[step];
  const figureId = figureIndex ? `figure-${figureIndex}` : `diagram-${definition.id}`;

  return (
    <figure
      id={figureId}
      className="not-prose article-figure my-10 scroll-mt-24"
      aria-labelledby={`${figureId}-caption`}
    >
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-black/10">
        <div className="border-b border-border bg-muted/30 px-4 py-3 sm:flex sm:items-start sm:justify-between sm:gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700 dark:text-teal-300">
              Interactive architecture
            </div>
            <h3 className="mt-1 text-base font-semibold text-foreground">{definition.title}</h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              {definition.purpose}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 sm:mt-0" aria-label="Diagram layer filters">
            {layers.map((layer) => {
              const on = enabledLayers.has(layer);
              return (
                <button
                  key={layer}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setEnabledLayers((current) => {
                      const next = new Set(current);
                      if (next.has(layer)) next.delete(layer);
                      else next.add(layer);
                      return next;
                    })
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    on
                      ? "border-teal-500/50 bg-teal-500/10 text-teal-800 dark:text-teal-200"
                      : "border-border text-muted-foreground opacity-65",
                  )}
                >
                  {layerLabels[layer]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="relative min-w-0 overflow-auto bg-[radial-gradient(circle_at_center,_hsl(var(--muted))_0,_transparent_70%)] p-2 sm:p-4">
            {detailNode ? (
              <DetailInfographic node={detailNode} onBack={() => setDetailNodeId(null)} />
            ) : (
              <svg
                viewBox={`0 0 ${definition.viewBox.width} ${definition.viewBox.height}`}
                role="group"
                aria-label={definition.accessibleSummary}
                className="h-auto min-h-[24rem] w-full"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <marker
                    id={`${definition.id}-arrow`}
                    markerWidth="10"
                    markerHeight="10"
                    refX="8"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L0,6 L9,3 z" fill="currentColor" />
                  </marker>
                </defs>
                {definition.edges.map((edge) => {
                  const from = definition.nodes.find((node) => node.id === edge.from);
                  const to = definition.nodes.find((node) => node.id === edge.to);
                  if (!from || !to || !visible(from.id) || !visible(to.id)) return null;
                  const highlighted = !trace || (traced.has(from.id) && traced.has(to.id));
                  return (
                    <line
                      key={edge.id}
                      x1={from.x + from.width}
                      y1={from.y + from.height / 2}
                      x2={to.x}
                      y2={to.y + to.height / 2}
                      stroke="currentColor"
                      strokeWidth={highlighted ? 3 : 1.5}
                      strokeOpacity={highlighted ? 0.7 : 0.15}
                      markerEnd={`url(#${definition.id}-arrow)`}
                      className="text-teal-700 dark:text-teal-300"
                    />
                  );
                })}
                {definition.nodes.map((node) => {
                  if (!node.layers.some((layer) => enabledLayers.has(layer))) return null;
                  const chosen = selectedId === node.id;
                  const highlighted =
                    chosen ||
                    hoveredId === node.id ||
                    activeStep?.nodeId === node.id ||
                    traced.has(node.id);
                  const dimmed = trace && selected ? !traced.has(node.id) : false;
                  const lines = wrappedLines(node.label);
                  return (
                    <g
                      key={node.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${node.label}. ${node.summary}`}
                      aria-pressed={chosen}
                      onClick={() => {
                        setSelectedId(node.id);
                        setTrace(null);
                      }}
                      onFocus={() => setHoveredId(node.id)}
                      onBlur={() => setHoveredId(null)}
                      onMouseEnter={() => setHoveredId(node.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(node.id);
                          setTrace(null);
                        }
                      }}
                      className="cursor-pointer outline-none"
                      opacity={dimmed ? 0.22 : 1}
                    >
                      <rect
                        x={node.x}
                        y={node.y}
                        width={node.width}
                        height={node.height}
                        rx="16"
                        fill="var(--color-card, #fff)"
                        stroke={nodeColors[node.classification]}
                        strokeWidth={highlighted ? 5 : 2.5}
                        className="drop-shadow-sm"
                      />
                      <rect
                        x={node.x}
                        y={node.y}
                        width="10"
                        height={node.height}
                        rx="5"
                        fill={nodeColors[node.classification]}
                      />
                      <text
                        x={node.x + 26}
                        y={node.y + 35}
                        fill="currentColor"
                        className="text-foreground"
                        fontSize="17"
                        fontWeight="700"
                      >
                        {lines.map((line, index) => (
                          <tspan key={line} x={node.x + 26} dy={index ? 23 : 0}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                      <text
                        x={node.x + 26}
                        y={node.y + node.height - 18}
                        fill={nodeColors[node.classification]}
                        fontSize="12"
                        fontWeight="700"
                        letterSpacing="1.2"
                      >
                        {node.classification.toUpperCase()}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
            {hoveredId &&
              !selectedId &&
              (() => {
                const node = definition.nodes.find((candidate) => candidate.id === hoveredId);
                return node ? (
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute left-5 top-5 max-w-xs rounded-xl border border-border bg-background/95 p-3 text-xs shadow-xl backdrop-blur"
                  >
                    <div className="font-semibold text-foreground">{node.label}</div>
                    <p className="mt-1 leading-relaxed text-muted-foreground">{node.summary}</p>
                    <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                      {node.classification} ·{" "}
                      {node.sourceKeys.length
                        ? `${node.sourceKeys.length} sources`
                        : "architecture interpretation"}
                    </div>
                  </div>
                ) : null;
              })()}
          </div>

          <aside
            className="border-t border-border bg-background p-4 lg:border-l lg:border-t-0"
            aria-live="polite"
          >
            {selected ? (
              <>
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: nodeColors[selected.classification] }}
                >
                  {selected.classification}
                </div>
                <h4 className="mt-1 text-base font-semibold text-foreground">{selected.label}</h4>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {selected.detail}
                </p>
                <div className="mt-4 rounded-lg bg-muted/55 p-3">
                  <div className="text-xs font-semibold text-foreground">Why it matters</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {selected.whyItMatters}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={trace === "up" ? "default" : "outline"}
                    onClick={() => setTrace("up")}
                  >
                    <ArrowUpFromLine className="mr-1 h-3.5 w-3.5" />
                    Upstream
                  </Button>
                  <Button
                    size="sm"
                    variant={trace === "down" ? "default" : "outline"}
                    onClick={() => setTrace("down")}
                  >
                    <ArrowDownToLine className="mr-1 h-3.5 w-3.5" />
                    Downstream
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelectedId(null);
                      setTrace(null);
                    }}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Clear
                  </Button>
                </div>
                <Button className="mt-4 w-full" onClick={() => setDetailNodeId(selected.id)}>
                  Drill into end-to-end infographic
                </Button>
                {selected.sourceKeys.length ? (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-foreground">Evidence</div>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                      {selected.sourceKeys.map((key) => (
                        <li key={key}>{key}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="mt-4 text-xs italic text-muted-foreground">
                    Architecture interpretation; follow the parent article citations for factual
                    grounding.
                  </p>
                )}
                {selected.drillTarget && (
                  <a
                    href={drillHref(selected.drillTarget)}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300"
                  >
                    {selected.drillTarget.label}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </>
            ) : (
              <div className="flex min-h-48 flex-col justify-center">
                <h4 className="text-sm font-semibold text-foreground">Explore this architecture</h4>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Hover or focus a node for a concise explanation. Select it to inspect
                  responsibilities, trace relationships, and follow related Atlas content.
                </p>
              </div>
            )}
          </aside>
        </div>

        {definition.walkthrough.length > 0 && (
          <div className="flex items-center gap-3 border-t border-border bg-muted/25 px-4 py-3">
            <Button
              size="sm"
              variant="outline"
              disabled={step === 0}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
            >
              Previous
            </Button>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground">{activeStep?.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {activeStep?.explanation}
              </div>
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {step + 1}/{definition.walkthrough.length}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={step >= definition.walkthrough.length - 1}
              onClick={() =>
                setStep((value) => Math.min(definition.walkthrough.length - 1, value + 1))
              }
            >
              Next
            </Button>
          </div>
        )}
      </div>
      <figcaption
        id={`${figureId}-caption`}
        className="mx-auto mt-3 max-w-[70ch] text-center text-sm italic leading-relaxed text-muted-foreground"
      >
        {caption || definition.purpose}
      </figcaption>
      <details className="mx-auto mt-3 max-w-3xl text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-foreground">Text description</summary>
        <p className="mt-2 leading-relaxed">{definition.longDescription}</p>
        <p className="mt-2">
          <a
            href={definition.staticPath}
            className="text-teal-700 hover:underline dark:text-teal-300"
          >
            Open static SVG fallback
          </a>
        </p>
      </details>
    </figure>
  );
}

function DetailInfographic({
  node,
  onBack,
}: {
  node: InteractiveDiagramDefinition["nodes"][number];
  onBack: () => void;
}) {
  const columns = [
    { title: "Inputs", items: node.inputs, tone: "border-sky-500/40 bg-sky-500/5" },
    { title: "Processing", items: node.processing, tone: "border-violet-500/40 bg-violet-500/5" },
    { title: "Outputs", items: node.outputs, tone: "border-teal-500/40 bg-teal-500/5" },
  ];
  return (
    <div className="min-h-[34rem] p-2 sm:p-4" aria-label={`Detailed infographic for ${node.label}`}>
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
      >
        ← Back to architecture choices
      </button>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            End-to-end drill-through
          </div>
          <h4 className="mt-1 text-xl font-semibold text-foreground">{node.label}</h4>
        </div>
        <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
          {node.classification}
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {columns.map((column, index) => (
          <div key={column.title} className={cn("relative rounded-2xl border p-4", column.tone)}>
            {index < 2 && (
              <span
                aria-hidden
                className="absolute -right-4 top-1/2 z-10 hidden -translate-y-1/2 text-2xl text-teal-600 md:block"
              >
                →
              </span>
            )}
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">
              {index + 1}. {column.title}
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {column.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border-2 border-teal-500/35 bg-teal-500/8 p-4">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-teal-800 dark:text-teal-200">
          Worked example
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground">{node.example}</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/5 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-200">
            Implementation controls
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {node.controls.map((item) => (
              <li key={item}>✓ {item}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800 dark:text-amber-200">
            Failure modes
          </div>
          <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {node.failureModes.map((item) => (
              <li key={item}>⚠ {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
