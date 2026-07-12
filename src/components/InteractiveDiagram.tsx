import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  ExternalLink,
  Maximize2,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { wrapLabel } from "@/diagrams/layout";
import {
  drillHref,
  type DiagramLayer,
  type DiagramNode,
  type InteractiveDiagramDefinition,
} from "@/diagrams/types";

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
} as const;

const classificationHelp = {
  fact: "Sourced product behaviour",
  pattern: "Recommended pattern, not a product guarantee",
  inference: "Architectural interpretation",
  warning: "Failure mode or limit",
} as const;

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

/**
 * Drill state lives in the URL (`?node=<diagramId>:<nodeId>`), not in component state. Previously
 * it was a local `detailNodeId`, so any re-render dropped the user back to the top-level diagram —
 * the "it reverts back to the original" bug. In the URL it survives re-render, back/forward, and
 * makes a drilled node a shareable link.
 */
function useDiagramUrlState(
  diagramId: string,
  parameter: "node" | "selected",
  historyMode: "push" | "replace",
) {
  const key = `${diagramId}:`;
  const read = useCallback(() => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get(parameter);
    return value?.startsWith(key) ? value.slice(key.length) : null;
  }, [key, parameter]);

  // Start null and adopt the URL after mount. Seeding state from window.location during the first
  // render would diverge from the server's HTML (which has no access to it) and break hydration.
  const [nodeId, setNodeId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setNodeId(read());
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [read]);

  const set = useCallback(
    (next: string | null) => {
      setNodeId(next);
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (next) url.searchParams.set(parameter, `${key}${next}`);
      else url.searchParams.delete(parameter);
      window.history[historyMode === "push" ? "pushState" : "replaceState"]({}, "", url);
    },
    [historyMode, key, parameter],
  );

  return [nodeId, set] as const;
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
  // Selection also lives in the URL. ReactMarkdown can re-render its custom image component when
  // citations or article chrome update; local-only selection vanished during that remount and made
  // the drill button impossible to use.
  const [selectedId, setSelectedId] = useDiagramUrlState(definition.id, "selected", "replace");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [trace, setTrace] = useState<"up" | "down" | null>(null);
  const [step, setStep] = useState(0);
  const [detailNodeId, setDetailNodeId] = useDiagramUrlState(definition.id, "node", "push");

  const selected = definition.nodes.find((node) => node.id === selectedId) ?? null;
  const detailNode = definition.nodes.find((node) => node.id === detailNodeId) ?? null;
  const traced =
    selected && trace ? connectedIds(definition, selected.id, trace) : new Set<string>();
  const visible = useCallback(
    (nodeId: string) => {
      const node = definition.nodes.find((candidate) => candidate.id === nodeId);
      return !!node?.layers.some((layer) => enabledLayers.has(layer));
    },
    [definition, enabledLayers],
  );
  const activeStep = definition.walkthrough[step];
  const figureId = figureIndex ? `figure-${figureIndex}` : `diagram-${definition.id}`;

  if (detailNode) {
    return (
      <figure id={figureId} className="not-prose article-figure my-10 scroll-mt-24">
        <DetailInfographic
          node={detailNode}
          diagramTitle={definition.title}
          onBack={() => setDetailNodeId(null)}
        />
      </figure>
    );
  }

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
              Interactive {definition.type}
            </div>
            {/*
              div/span, not h3/p. Markdown wraps a standalone image in a <p>, so this figure is
              rendered inside a paragraph — nesting <h3>/<p> there is invalid HTML and React
              refuses to hydrate it.
            */}
            <div
              role="heading"
              aria-level={3}
              className="mt-1 text-base font-semibold text-foreground"
            >
              {definition.title}
            </div>
            <span className="mt-1 block max-w-3xl text-xs leading-relaxed text-muted-foreground">
              {definition.purpose}
            </span>
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

        <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="relative min-w-0 overflow-auto p-2 sm:p-4">
            {/*
              Never let the SVG scale below legibility. `w-full` alone shrank a wide diagram to fit
              the article column, collapsing 190px nodes to ~48px — unreadable and too small to
              click. A min-width tied to the viewBox keeps nodes at usable size and lets the
              container scroll horizontally instead.
            */}
            <svg
              viewBox={`0 0 ${definition.viewBox.width} ${definition.viewBox.height}`}
              role="group"
              aria-label={definition.accessibleSummary}
              className="h-auto w-full"
              style={{ minWidth: Math.min(definition.viewBox.width, 720) }}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <marker
                  id={`${definition.id}-arrow`}
                  markerWidth="9"
                  markerHeight="9"
                  refX="8"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,6 L9,3 z" fill="currentColor" />
                </marker>
              </defs>

              {definition.lanes.map((lane) => (
                <g key={lane.id} aria-hidden>
                  <text
                    x={lane.x}
                    y={lane.y}
                    fontSize="11"
                    fontWeight="700"
                    letterSpacing="1.4"
                    className="fill-muted-foreground"
                  >
                    {lane.label.toUpperCase()}
                  </text>
                </g>
              ))}

              {definition.edges.map((edge) => {
                if (!visible(edge.from) || !visible(edge.to)) return null;
                const highlighted = !trace || (traced.has(edge.from) && traced.has(edge.to));
                return (
                  <g key={edge.id} className="text-teal-700 dark:text-teal-300">
                    <path
                      d={edge.path}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={highlighted ? 2.5 : 1.25}
                      strokeOpacity={highlighted ? 0.75 : 0.15}
                      strokeDasharray={edge.kind === "branch" ? "6 5" : undefined}
                      markerEnd={`url(#${definition.id}-arrow)`}
                    />
                    {edge.label && highlighted && (
                      <text
                        x={edge.labelX}
                        y={edge.labelY}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="600"
                        className="fill-muted-foreground"
                      >
                        <tspan
                          className="fill-card"
                          stroke="var(--color-card, #fff)"
                          strokeWidth="6"
                          paintOrder="stroke"
                        >
                          {edge.label}
                        </tspan>
                      </text>
                    )}
                  </g>
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
                const lines = wrapLabel(node.label, node.width);
                const color = nodeColors[node.classification];
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
                    onDoubleClick={() => setDetailNodeId(node.id)}
                    onFocus={() => setHoveredId(node.id)}
                    onBlur={() => setHoveredId(null)}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && event.shiftKey) {
                        event.preventDefault();
                        setDetailNodeId(node.id);
                        return;
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(node.id);
                        setTrace(null);
                      }
                    }}
                    className="cursor-pointer outline-none"
                    opacity={dimmed ? 0.2 : 1}
                  >
                    <rect
                      x={node.x}
                      y={node.y}
                      width={node.width}
                      height={node.height}
                      rx="14"
                      fill="var(--color-card, #fff)"
                      stroke={color}
                      strokeWidth={highlighted ? 3.5 : 1.75}
                      className="drop-shadow-sm"
                    />
                    <rect
                      x={node.x}
                      y={node.y}
                      width="8"
                      height={node.height}
                      rx="4"
                      fill={color}
                    />
                    <text
                      x={node.x + 24}
                      y={node.y + 32}
                      fill="currentColor"
                      className="text-foreground"
                      fontSize="15"
                      fontWeight="700"
                    >
                      {lines.map((line, index) => (
                        <tspan key={line} x={node.x + 24} dy={index ? 21 : 0}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                    <text
                      x={node.x + 24}
                      y={node.y + node.height - 16}
                      fill={color}
                      fontSize="10"
                      fontWeight="700"
                      letterSpacing="1.1"
                    >
                      {node.classification.toUpperCase()}
                      {node.evidence.length > 0 && ` · ${node.evidence.length} CITED`}
                    </text>
                  </g>
                );
              })}
            </svg>

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
                      {classificationHelp[node.classification]}
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
                  {classificationHelp[selected.classification]}
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
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                  Drill into {selected.label}
                </Button>
                <div className="mt-4">
                  <div className="text-xs font-semibold text-foreground">Evidence</div>
                  {selected.evidence.length ? (
                    <ul className="mt-1.5 space-y-1.5">
                      {selected.evidence.map((item) => (
                        <li key={item.sourceKey} className="text-xs leading-relaxed">
                          <span className="rounded bg-teal-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-teal-800 dark:text-teal-200">
                            {item.sourceKey}
                          </span>
                          <span className="ml-1.5 text-muted-foreground">{item.note}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs italic text-muted-foreground">
                      Architecture interpretation; follow the parent article citations for factual
                      grounding.
                    </p>
                  )}
                </div>
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
                  responsibilities, trace upstream and downstream, and open the end-to-end
                  infographic.
                </p>
                <dl className="mt-4 space-y-1.5">
                  {(Object.keys(nodeColors) as (keyof typeof nodeColors)[]).map((key) => (
                    <div key={key} className="flex items-start gap-2 text-[11px]">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: nodeColors[key] }}
                      />
                      <dt className="font-semibold capitalize text-foreground">{key}</dt>
                      <dd className="text-muted-foreground">{classificationHelp[key]}</dd>
                    </div>
                  ))}
                </dl>
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

/**
 * The drill-down. Previously three bulleted columns of topic-generic text; now a visual pipeline
 * (inputs → processing → outputs) with sourced stat tiles, implementation controls, and failure
 * modes as annotated callouts — all specific to the node, not its topic.
 */
function DetailInfographic({
  node,
  diagramTitle,
  onBack,
}: {
  node: DiagramNode;
  diagramTitle: string;
  onBack: () => void;
}) {
  const color = nodeColors[node.classification];
  const stages = [
    { title: "Inputs", items: node.drill.inputs, accent: "sky" as const },
    { title: "Processing", items: node.drill.processing, accent: "violet" as const },
    { title: "Outputs", items: node.drill.outputs, accent: "teal" as const },
  ];
  const accents = {
    sky: "border-sky-500/40 bg-sky-500/[0.06] text-sky-700 dark:text-sky-300",
    violet: "border-violet-500/40 bg-violet-500/[0.06] text-violet-700 dark:text-violet-300",
    teal: "border-teal-500/40 bg-teal-500/[0.06] text-teal-700 dark:text-teal-300",
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg shadow-black/10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to {diagramTitle}
        </button>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white"
          style={{ background: color }}
        >
          {classificationHelp[node.classification]}
        </span>
      </div>

      <div className="p-4 sm:p-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          End-to-end drill-through
        </div>
        <h4 className="mt-1 text-2xl font-semibold text-foreground">{node.label}</h4>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {node.detail}
        </p>

        {node.drill.metrics?.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {node.drill.metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-border bg-background p-3.5"
              >
                <div className="text-2xl font-bold tabular-nums text-foreground">
                  {metric.value}
                </div>
                <div className="mt-0.5 text-xs font-medium text-muted-foreground">
                  {metric.label}
                </div>
                {metric.sourceKey ? (
                  <div className="mt-1.5 font-mono text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                    {metric.sourceKey}
                  </div>
                ) : (
                  <div className="mt-1.5 text-[10px] italic text-muted-foreground">
                    pattern guidance
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-5 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {stages.map((stage, index) => (
            <div key={stage.title} className="contents">
              <div className={cn("rounded-2xl border p-4", accents[stage.accent])}>
                <div className="text-xs font-bold uppercase tracking-[0.14em]">
                  {index + 1}. {stage.title}
                </div>
                <ul className="mt-3 space-y-2 text-sm text-foreground/90">
                  {stage.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {index < stages.length - 1 && (
                <div
                  aria-hidden
                  className="hidden items-center justify-center text-2xl text-muted-foreground md:flex"
                >
                  →
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border-2 border-teal-500/35 bg-teal-500/[0.07] p-4">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-teal-800 dark:text-teal-200">
            Worked example
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{node.drill.example}</p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/[0.05] p-4">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800 dark:text-emerald-200">
              Implementation controls
            </div>
            <ul className="mt-2.5 space-y-2 text-sm text-muted-foreground">
              {node.drill.controls.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.05] p-4">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800 dark:text-amber-200">
              Failure modes
            </div>
            <ul className="mt-2.5 space-y-2 text-sm text-muted-foreground">
              {node.drill.failureModes.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="font-bold text-amber-600 dark:text-amber-400">⚠</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {node.evidence.length > 0 && (
          <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">
              Evidence
            </div>
            <ul className="mt-2.5 space-y-2">
              {node.evidence.map((item) => (
                <li key={item.sourceKey} className="flex gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 rounded bg-teal-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-teal-800 dark:text-teal-200">
                    {item.sourceKey}
                  </span>
                  <span className="text-muted-foreground">{item.note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {node.drillTarget && (
          <a
            href={drillHref(node.drillTarget)}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300"
          >
            {node.drillTarget.label}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
