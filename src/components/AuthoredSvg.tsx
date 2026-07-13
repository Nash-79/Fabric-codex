import { useMemo, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import type { Citation } from "@/components/CitationSidebar";
import type { AuthoredDiagram, AuthoredDiagramNode } from "@/diagrams/types";
import { cn } from "@/lib/utils";

type ActiveNode = {
  node: AuthoredDiagramNode;
  left: number;
  top: number;
};

function nodeElement(target: EventTarget | null) {
  return target instanceof Element ? target.closest<SVGElement>("[data-node-id]") : null;
}

export function AuthoredSvg({
  markup,
  definition,
  citations = [],
  className,
}: {
  markup: string;
  definition: AuthoredDiagram;
  citations?: Citation[];
  className?: string;
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

  const activate = (element: SVGElement | null) => {
    const root = rootRef.current;
    const id = element?.dataset.nodeId;
    const node = id ? nodes.get(id) : undefined;
    if (!root || !element || !node) return;
    const rootBox = root.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    setActive({
      node,
      left: box.left - rootBox.left + box.width / 2,
      top: Math.max(8, box.top - rootBox.top),
    });
  };

  const onPointerOver = (event: PointerEvent<HTMLDivElement>) =>
    activate(nodeElement(event.target));
  const onFocus = (event: FocusEvent<HTMLDivElement>) => activate(nodeElement(event.target));

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
    >
      <div
        className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      {active && (
        <aside
          role="tooltip"
          className="pointer-events-auto absolute z-30 w-[min(22rem,calc(100%-1rem))] -translate-x-1/2 -translate-y-[calc(100%+0.5rem)] rounded-xl border border-border bg-popover p-3 text-left text-popover-foreground shadow-xl"
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
