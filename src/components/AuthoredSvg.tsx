import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import type { Citation } from "@/components/CitationSidebar";
import type { AuthoredDiagram, AuthoredDiagramNode } from "@/diagrams/types";
import { cn } from "@/lib/utils";

type ActiveNode = {
  node: AuthoredDiagramNode;
  left: number;
  top: number;
  placement: "above" | "below";
};

function nodeElement(target: EventTarget | null) {
  return target instanceof Element ? target.closest<SVGElement>("[data-node-id]") : null;
}

export function AuthoredSvg({
  markup,
  definition,
  citations = [],
  className,
  selectedNodeId,
  onSelectNode,
  walkthroughNodeId,
  dimmedNodeIds,
}: {
  markup: string;
  definition: AuthoredDiagram;
  citations?: Citation[];
  className?: string;
  /** Persists across blur, unlike the hover tooltip — set by a click/tap/Enter, not a hover. */
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  /** The current walkthrough step's node, if a guided walkthrough is active. Visually distinct
      from selectedNodeId — a walkthrough highlight persists per-step regardless of what the
      user last clicked. */
  walkthroughNodeId?: string | null;
  /** Node ids to visually dim (an active layer filter's non-matching regions). Never mutates the
      underlying SVG — a transient DOM attribute only, gone on unmount. */
  dimmedNodeIds?: Set<string>;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<ActiveNode | null>(null);
  const nodes = useMemo(
    () => new Map(definition.nodes.map((node) => [node.id, node] as const)),
    [definition.nodes],
  );
  const citationByKey = useMemo(
    () =>
      new Map(
        citations.flatMap((citation) => {
          const key = citation.source?.source_key ?? citation.source?.slug;
          return key ? [[key, citation] as const] : [];
        }),
      ),
    [citations],
  );

  // Below this container width, a floating tooltip sized off the container itself has no safe
  // room to sit next to the region it's describing (this is the bug behind the diagram's tooltip
  // swallowing the whole canvas when InteractiveDiagram's side-by-side split gives the diagram a
  // narrow column, e.g. inside DiagramLightbox's react-zoom-pan-pinch transform). Below the
  // threshold, rely solely on click/tap/Enter's pinned DiagramDetailPanel (onSelectNode) instead
  // of also trying to float a tooltip — the persistent panel already shows the same content.
  const MIN_TOOLTIP_CONTAINER_WIDTH = 280;

  const activate = (element: SVGElement | null) => {
    const root = rootRef.current;
    const id = element?.dataset.nodeId;
    const node = id ? nodes.get(id) : undefined;
    if (!root || !element || !node) return;
    const rootBox = root.getBoundingClientRect();
    if (rootBox.width < MIN_TOOLTIP_CONTAINER_WIDTH) return;
    const box = element.getBoundingClientRect();
    const rawLeft = box.left - rootBox.left + box.width / 2;
    const tooltipWidth = Math.min(352, Math.max(0, rootBox.width - 16));
    const halfTooltip = tooltipWidth / 2;
    const relativeTop = box.top - rootBox.top;
    const placement = relativeTop >= 190 ? "above" : "below";
    setActive({
      node,
      left: Math.min(
        Math.max(rawLeft, halfTooltip + 8),
        Math.max(halfTooltip + 8, rootBox.width - halfTooltip - 8),
      ),
      top: placement === "above" ? relativeTop : box.bottom - rootBox.top,
      placement,
    });
  };

  const onPointerOver = (event: PointerEvent<HTMLDivElement>) =>
    activate(nodeElement(event.target));
  const onFocus = (event: FocusEvent<HTMLDivElement>) => activate(nodeElement(event.target));

  // Click/tap/Enter/Space pins a node's selection open — additive to, not a replacement for, the
  // hover/focus tooltip above. Toggles off when re-clicking the already-selected node.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const el = nodeElement(event.target);
    const id = el?.dataset.nodeId;
    if (!id || !onSelectNode) return;
    onSelectNode(selectedNodeId === id ? null : id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const el = nodeElement(event.target);
    const id = el?.dataset.nodeId;
    if (!id || !onSelectNode) return;
    event.preventDefault();
    onSelectNode(selectedNodeId === id ? null : id);
  };

  // Toggle data-selected/data-walkthrough-current/data-dimmed directly on the matched SVG region
  // post-mount — never re-renders dangerouslySetInnerHTML (which would blow away nested state)
  // and never touches the underlying static SVG file itself.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const regions = root.querySelectorAll<SVGElement>("[data-node-id]");
    for (const region of regions) {
      const id = region.dataset.nodeId;
      region.toggleAttribute("data-selected", id === selectedNodeId);
      region.toggleAttribute("data-walkthrough-current", id === walkthroughNodeId);
      region.toggleAttribute("data-dimmed", Boolean(id && dimmedNodeIds?.has(id)));
    }
  }, [markup, selectedNodeId, walkthroughNodeId, dimmedNodeIds]);

  return (
    <div
      ref={rootRef}
      className={cn("authored-svg relative h-full w-full", className)}
      onPointerOver={onPointerOver}
      onPointerLeave={() => setActive(null)}
      onFocusCapture={onFocus}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setActive(null);
      }}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div
        className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      {active && (
        <aside
          role="tooltip"
          className={cn(
            "pointer-events-auto absolute z-30 max-h-[min(18rem,calc(100%-1rem))] w-[min(22rem,calc(100%-1rem))] -translate-x-1/2 overflow-y-auto rounded-xl border border-border bg-popover p-3 text-left text-popover-foreground shadow-xl",
            active.placement === "above" ? "-translate-y-[calc(100%+0.5rem)]" : "translate-y-2",
          )}
          style={{ left: active.left, top: active.top }}
        >
          <div className="flex items-start justify-between gap-3">
            <strong className="text-sm leading-snug">{active.node.label}</strong>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {active.node.classification}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {active.node.summary}
          </p>
          {active.node.evidence.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Evidence
              </div>
              <ul className="mt-1 space-y-1">
                {active.node.evidence.slice(0, 3).map((evidence, index) => {
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
        </aside>
      )}
    </div>
  );
}
