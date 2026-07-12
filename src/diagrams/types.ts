export type DiagramClassification = "fact" | "pattern" | "inference" | "warning";

export type DiagramLayer =
  "data" | "compute" | "governance" | "security" | "metadata" | "orchestration" | "observability";

export type DiagramKind = "architecture" | "decision" | "flow" | "model" | "internals";

export type DiagramDrillTarget = {
  kind: "topic" | "capability" | "article" | "design" | "lesson" | "diagram";
  slug: string;
  label: string;
};

/**
 * A cited piece of evidence behind a node. `sourceKey` matches a source record in the KB, so a
 * node can be traced the same way a claim is. A `fact` node with no evidence fails validation.
 */
export type DiagramEvidence = {
  sourceKey: string;
  note: string;
};

/** A number worth showing on the drill-down infographic rather than burying in prose. */
export type DiagramMetric = {
  label: string;
  value: string;
  /** Omitted when the figure is a pattern/inference rather than a sourced product fact. */
  sourceKey?: string;
};

/** The structured drill-down. Replaces the six loose string arrays on the old node type. */
export type DiagramDrill = {
  /** Left column of the drill infographic — what arrives. */
  inputs: string[];
  /** Middle — what this element actually does, in order. */
  processing: string[];
  /** Right — what it hands downstream. */
  outputs: string[];
  /** One concrete traced example. Not a template. */
  example: string;
  /** Levers an implementer actually sets. */
  controls: string[];
  /** How this element fails in production, rendered as annotated callouts. */
  failureModes: string[];
  /** Optional figures rendered as stat tiles on the drill view. */
  metrics?: DiagramMetric[];
};

/**
 * What the diagram-author agent writes into content/diagrams/<slug>.diagram.json.
 * Deliberately carries NO x/y/width/height — geometry is derived by the layout engine, so an
 * author never hand-places boxes and the topology always reflects the edges.
 */
export type AuthoredDiagramNode = {
  id: string;
  label: string;
  /** One line, shown on hover. */
  summary: string;
  /** A paragraph, shown in the side panel on select. */
  detail: string;
  whyItMatters: string;
  classification: DiagramClassification;
  layers: DiagramLayer[];
  evidence: DiagramEvidence[];
  tags?: string[];
  drill: DiagramDrill;
  drillTarget?: DiagramDrillTarget;
  /**
   * Optional lane/rank hint. The layout engine derives rank from the edge graph; set this only
   * to pin a node that the graph alone would rank ambiguously (e.g. a legend or a side concern).
   */
  rank?: number;
};

export type AuthoredDiagramEdge = {
  id: string;
  from: string;
  to: string;
  /** Rendered on the edge. A flow whose arrows say nothing is a decorative flow. */
  label?: string;
  layer: DiagramLayer;
  /** Branch edges (decision trees) render dashed + labelled; flow edges render solid. */
  kind?: "flow" | "branch" | "feedback";
};

export type DiagramWalkthroughStep = {
  nodeId: string;
  title: string;
  explanation: string;
};

export type AuthoredDiagram = {
  id: string;
  title: string;
  purpose: string;
  accessibleSummary: string;
  longDescription: string;
  type: DiagramKind;
  topicSlug?: string;
  capabilityIds: string[];
  revision: string;
  qaStatus: "draft" | "passed" | "failed";
  /** The hand-drawn SVG kept as the print / no-JavaScript fallback. */
  staticPath: string;
  nodes: AuthoredDiagramNode[];
  edges: AuthoredDiagramEdge[];
  walkthrough: DiagramWalkthroughStep[];
};

/* ------------------------------------------------------------------ *
 * Laid-out shapes — what the renderer consumes.
 * ------------------------------------------------------------------ */

export type DiagramNode = AuthoredDiagramNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DiagramEdge = AuthoredDiagramEdge & {
  /** Orthogonal route through the canvas, not a straight centre-to-centre line. */
  path: string;
  /** Where to anchor the edge label. */
  labelX: number;
  labelY: number;
};

/** A titled horizontal band grouping nodes of the same rank (architecture/flow diagrams). */
export type DiagramLane = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type InteractiveDiagramDefinition = Omit<AuthoredDiagram, "nodes" | "edges"> & {
  viewBox: { width: number; height: number };
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  lanes: DiagramLane[];
};

export function drillHref(target: DiagramDrillTarget): string {
  switch (target.kind) {
    case "topic":
      return `/topics/${target.slug}`;
    case "capability":
      return `/registry/${target.slug}`;
    case "article":
      return `/blogs/article/${target.slug}`;
    case "design":
      return `/design/${target.slug}`;
    case "lesson":
      return `/blogs/lesson/${target.slug}`;
    case "diagram":
      return `#diagram-${target.slug}`;
  }
}
