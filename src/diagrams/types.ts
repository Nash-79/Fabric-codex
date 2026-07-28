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
 * Carries the evidence and semantic topology paired to regions in the authored SVG. Geometry
 * belongs in the SVG itself; the sidecar never duplicates x/y/width/height coordinates.
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
  /** The authored infographic used for reading, print, and no-JavaScript fallback. */
  staticPath: string;
  /**
   * Inline embed width mode (Editorial Experience Revamp Phase 5). Optional, defaults to
   * "standard" (today's behavior) when absent — only set this to opt a diagram into breaking out
   * of the reading column.
   */
  layoutHint?: "standard" | "wide" | "full-bleed";
  nodes: AuthoredDiagramNode[];
  edges: AuthoredDiagramEdge[];
  walkthrough: DiagramWalkthroughStep[];
};
