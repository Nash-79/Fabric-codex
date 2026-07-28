import { useEffect, useMemo, useState } from "react";
import { AuthoredSvg } from "@/components/AuthoredSvg";
import { DiagramDetailPanel } from "@/components/DiagramDetailPanel";
import type { Citation } from "@/components/CitationSidebar";
import type { AuthoredDiagram, DiagramLayer } from "@/diagrams/types";
import { getAuthoredDiagram, getStaticDiagramSvg } from "@/diagrams/catalog";

// Sits between DiagramLightbox ("the stage" — figure chrome, Dialog, zoom/pan, fullscreen,
// keyboard bridge) and AuthoredSvg ("dumb" SVG rendering + region hit-testing). Owns all
// selection/walkthrough/filter interaction state so AuthoredSvg never has to carry those
// concerns, and both the inline figure and the lightbox Dialog reuse the exact same component.
export function InteractiveDiagram({
  markup,
  definition,
  citations = [],
  className,
  walkthroughActive = false,
  walkthroughStepIndex = 0,
  onWalkthroughNodeChange,
}: {
  markup: string;
  definition: AuthoredDiagram;
  citations?: Citation[];
  className?: string;
  /** True while DiagramLightbox's walkthrough mode is toggled on. */
  walkthroughActive?: boolean;
  walkthroughStepIndex?: number;
  /** Notifies the parent (DiagramLightbox) of the current step's node id, so it can render
      DiagramWalkthroughBar's "Step N of total" without duplicating step-lookup logic. */
  onWalkthroughNodeChange?: (nodeId: string | null) => void;
}) {
  // Diagram-to-diagram drillTarget navigation re-renders this same instance with a different
  // diagram's data, rather than opening a second lightbox — "jump to that diagram inline."
  const [activeDiagram, setActiveDiagram] = useState<{
    markup: string;
    definition: AuthoredDiagram;
  } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeLayerFilter, setActiveLayerFilter] = useState<Set<DiagramLayer> | null>(null);

  const effectiveMarkup = activeDiagram?.markup ?? markup;
  const effectiveDefinition = activeDiagram?.definition ?? definition;

  const walkthroughNodeId = walkthroughActive
    ? (effectiveDefinition.walkthrough[walkthroughStepIndex]?.nodeId ?? null)
    : null;

  const dimmedNodeIds = useMemo(() => {
    if (!activeLayerFilter || activeLayerFilter.size === 0) return undefined;
    const dimmed = new Set<string>();
    for (const node of effectiveDefinition.nodes) {
      if (!node.layers.some((layer) => activeLayerFilter.has(layer))) dimmed.add(node.id);
    }
    return dimmed;
  }, [activeLayerFilter, effectiveDefinition.nodes]);

  const selectedNode = selectedNodeId
    ? (effectiveDefinition.nodes.find((n) => n.id === selectedNodeId) ?? null)
    : null;

  function toggleLayerFilter(layer: DiagramLayer) {
    setActiveLayerFilter((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next.size > 0 ? next : null;
    });
  }

  function navigateToDiagram(slug: string) {
    const nextDefinition = getAuthoredDiagram(slug);
    const nextMarkup = getStaticDiagramSvg(slug);
    if (!nextDefinition || !nextMarkup) return;
    setActiveDiagram({ markup: nextMarkup, definition: nextDefinition });
    setSelectedNodeId(null);
    setActiveLayerFilter(null);
  }

  // Entering/advancing walkthrough mode pins the current step's node open in the detail panel —
  // reuses DiagramDetailPanel rather than a second explanation surface.
  const effectiveSelectedNodeId = walkthroughActive ? walkthroughNodeId : selectedNodeId;

  useEffect(() => {
    if (walkthroughActive) onWalkthroughNodeChange?.(walkthroughNodeId);
  }, [walkthroughActive, walkthroughNodeId, onWalkthroughNodeChange]);

  return (
    <div className={className}>
      <div className="grid gap-4 sm:hidden">
        <AuthoredSvg
          markup={effectiveMarkup}
          definition={effectiveDefinition}
          citations={citations}
          selectedNodeId={effectiveSelectedNodeId}
          onSelectNode={walkthroughActive ? undefined : setSelectedNodeId}
          walkthroughNodeId={walkthroughNodeId}
          dimmedNodeIds={dimmedNodeIds}
          className="h-full w-full"
        />
        <DiagramDetailPanel
          node={
            walkthroughActive
              ? (effectiveDefinition.nodes.find((n) => n.id === walkthroughNodeId) ?? null)
              : selectedNode
          }
          citations={citations}
          legendNodes={effectiveDefinition.nodes}
          activeLayerFilter={activeLayerFilter}
          onToggleLayerFilter={toggleLayerFilter}
          onClose={() => setSelectedNodeId(null)}
          onNavigateToDiagram={navigateToDiagram}
          variant="stacked"
        />
      </div>
      <div className="hidden gap-6 sm:grid sm:grid-cols-[1fr_22rem]">
        <AuthoredSvg
          markup={effectiveMarkup}
          definition={effectiveDefinition}
          citations={citations}
          selectedNodeId={effectiveSelectedNodeId}
          onSelectNode={walkthroughActive ? undefined : setSelectedNodeId}
          walkthroughNodeId={walkthroughNodeId}
          dimmedNodeIds={dimmedNodeIds}
          className="h-full w-full"
        />
        <DiagramDetailPanel
          node={
            walkthroughActive
              ? (effectiveDefinition.nodes.find((n) => n.id === walkthroughNodeId) ?? null)
              : selectedNode
          }
          citations={citations}
          legendNodes={effectiveDefinition.nodes}
          activeLayerFilter={activeLayerFilter}
          onToggleLayerFilter={toggleLayerFilter}
          onClose={() => setSelectedNodeId(null)}
          onNavigateToDiagram={navigateToDiagram}
          variant="side"
        />
      </div>
    </div>
  );
}
