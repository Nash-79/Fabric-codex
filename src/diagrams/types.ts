export type DiagramClassification = "fact" | "pattern" | "inference" | "warning";

export type DiagramLayer =
  "data" | "compute" | "governance" | "security" | "metadata" | "orchestration" | "observability";

export type DiagramDrillTarget = {
  kind: "topic" | "capability" | "article" | "design" | "lesson" | "diagram";
  slug: string;
  label: string;
};

export type DiagramNode = {
  id: string;
  label: string;
  summary: string;
  detail: string;
  whyItMatters: string;
  inputs: string[];
  processing: string[];
  outputs: string[];
  example: string;
  controls: string[];
  failureModes: string[];
  classification: DiagramClassification;
  sourceKeys: string[];
  tags: string[];
  layers: DiagramLayer[];
  x: number;
  y: number;
  width: number;
  height: number;
  drillTarget?: DiagramDrillTarget;
};

export type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  layer: DiagramLayer;
};

export type DiagramWalkthroughStep = {
  nodeId: string;
  title: string;
  explanation: string;
};

export type InteractiveDiagramDefinition = {
  id: string;
  title: string;
  purpose: string;
  accessibleSummary: string;
  longDescription: string;
  type: "architecture" | "decision" | "flow" | "model" | "internals";
  topicSlug?: string;
  capabilityIds: string[];
  revision: string;
  qaStatus: "draft" | "passed" | "failed";
  staticPath: string;
  viewBox: { width: number; height: number };
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  walkthrough: DiagramWalkthroughStep[];
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
