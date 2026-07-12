import diagramAssets from "../../content/diagrams/assets.json";
import { layoutDiagram } from "./layout";
import type {
  AuthoredDiagram,
  DiagramClassification,
  DiagramLayer,
  InteractiveDiagramDefinition,
} from "./types";

/**
 * Authored sidecars are the source of truth. `content/diagrams/<slug>.diagram.json` carries real
 * nodes, real edges, and per-node evidence, written by the diagram-author agent alongside the
 * hand-drawn SVG (which remains the print / no-JavaScript fallback).
 *
 * Diagrams without a sidecar fall back to `definitionFromAsset` below, which derives placeholder
 * nodes from the caption string. That fallback is a migration crutch, not a design: it cannot cite
 * sources and it cannot know the real topology. Delete it once every asset has a sidecar.
 */
const sidecarModules = import.meta.glob<{ default: AuthoredDiagram }>(
  "../../content/diagrams/*.diagram.json",
  { eager: true },
);

const sidecars = new Map<string, AuthoredDiagram>(
  Object.entries(sidecarModules).map(([path, module]) => {
    const slug = path
      .split("/")
      .pop()!
      .replace(/\.diagram\.json$/, "");
    return [slug, module.default];
  }),
);

type Asset = {
  path: string;
  caption?: string;
  topic_slug?: string;
  capability_id?: string;
  interaction_version?: string;
  qa_status?: "draft" | "passed" | "failed";
};

const layerOrder: DiagramLayer[] = [
  "data",
  "orchestration",
  "compute",
  "metadata",
  "governance",
  "security",
  "observability",
];

const topicExamples: Record<
  string,
  {
    inputs: string[];
    processing: string[];
    outputs: string[];
    example: string;
    controls: string[];
    failures: string[];
  }
> = {
  "architecture-strategy": {
    inputs: ["Business outcome", "Domain ownership", "Freshness and recovery objectives"],
    processing: [
      "Choose Fabric workload boundaries",
      "Place governed data in OneLake",
      "Sequence delivery and capacity decisions",
    ],
    outputs: ["Architecture decision record", "Capability roadmap", "Owned data-product boundary"],
    example:
      "A finance domain starts with a governed daily positions product, proves its OneLake-to-semantic-model path, then adds intraday risk only after operations are measurable.",
    controls: ["Workspace and item ownership", "Capacity budget", "Purview and lineage review"],
    failures: [
      "Platform-first programme with no product outcome",
      "Unowned shared workspace",
      "Capacity treated as an afterthought",
    ],
  },
  "data-modelling": {
    inputs: ["Business questions", "Declared grain", "Keys and history requirements"],
    processing: [
      "Create conceptual and logical models",
      "Choose dimensional, vault, or canonical structures",
      "Implement Delta/Warehouse and semantic contracts",
    ],
    outputs: ["Conformed entities", "Facts and dimensions", "Certified semantic model"],
    example:
      "Orders at order-line grain join conformed customer and product dimensions; the semantic model exposes governed revenue measures without changing the physical grain.",
    controls: ["Grain and key tests", "Relationship validation", "Measure ownership"],
    failures: [
      "Mixed grain in one fact",
      "History rules hidden in code",
      "Semantic definitions duplicated per report",
    ],
  },
  "silver-layer-modelling": {
    inputs: ["Bronze source records", "CDC or extraction metadata", "Data-quality rules"],
    processing: [
      "Standardise types and identifiers",
      "Deduplicate and reconcile change order",
      "Apply conformance and SCD history",
    ],
    outputs: [
      "Reusable Delta silver tables",
      "Quarantine records",
      "Quality and reconciliation metrics",
    ],
    example:
      "Customer CDC rows are ordered by source commit time, deduplicated by business key, and applied to an SCD Type 2 customer table while invalid records enter quarantine.",
    controls: ["Idempotent merge key", "Schema-evolution policy", "Late-arrival handling"],
    failures: [
      "Latest-row logic without deterministic ordering",
      "Business aggregates placed in silver",
      "Quarantine with no replay path",
    ],
  },
  "metadata-driven-architecture": {
    inputs: ["Versioned dataset contract", "Source/target configuration", "Execution policy"],
    processing: [
      "Resolve configuration",
      "Invoke reusable pipeline/notebook",
      "Persist run state and quality evidence",
    ],
    outputs: ["Repeatable dataset load", "Run ledger", "Lineage and operational telemetry"],
    example:
      "An Orders metadata row selects the ADLS connector, bronze target, merge notebook, watermark column, retry policy, and quality rule set without cloning a pipeline.",
    controls: [
      "Schema-validated metadata",
      "Secret references, never secret values",
      "Version and promotion history",
    ],
    failures: [
      "Metadata becomes an untyped programming language",
      "Configuration changed mid-run",
      "Retry repeats a non-idempotent write",
    ],
  },
  "event-driven-architecture": {
    inputs: [
      "Business or platform event",
      "Event identity and event time",
      "Routing and replay requirements",
    ],
    processing: [
      "Route through Eventstream",
      "Evaluate hot-path action",
      "Persist durable history and trigger governed work",
    ],
    outputs: ["Immediate action", "Replayable event record", "Downstream analytical state"],
    example:
      "An order.created event is routed to a hot operational alert and a durable Eventhouse/Lakehouse path; the processing key prevents a replay from duplicating the order load.",
    controls: [
      "Idempotency key",
      "Dead-letter/replay procedure",
      "Event-time and late-event policy",
    ],
    failures: [
      "Treating notification as durable state",
      "No duplicate-event strategy",
      "Trigger storm overwhelms batch-oriented work",
    ],
  },
  "architecture-implementation": {
    inputs: [
      "Approved target architecture",
      "Environment and identity baseline",
      "Acceptance measures",
    ],
    processing: [
      "Build a thin vertical slice",
      "Automate promotion and tests",
      "Operationalise recovery, cost, and support",
    ],
    outputs: [
      "Deployable Fabric data product",
      "Evidence-backed release",
      "Scale-out implementation template",
    ],
    example:
      "A sales slice lands one source, produces one conformed silver model, one gold fact, and one certified report with deployment, rollback, monitoring, and support ownership proven end to end.",
    controls: [
      "Environment-specific configuration",
      "Automated contract and data tests",
      "Release and rollback evidence",
    ],
    failures: [
      "Building every framework before one slice",
      "Manual production-only configuration",
      "Handover without operational acceptance",
    ],
  },
};

function detailsFor(topic: string | undefined, layer: DiagramLayer, term: string) {
  const explicit = topic ? topicExamples[topic] : undefined;
  if (explicit) return explicit;
  return {
    inputs: ["Upstream contract", `${layer} requirements`, "Ownership and service objective"],
    processing: [
      `Apply the ${term} responsibility`,
      "Record state and evidence",
      "Pass a versioned contract downstream",
    ],
    outputs: ["Governed result", "Observable completion signal", "Downstream contract"],
    example: `Trace one representative data product through ${term}, then verify the hand-off to the next connected element before generalising the pattern.`,
    controls: ["Identity and access", "Quality and reconciliation", "Retry and recovery"],
    failures: ["Implicit ownership", "Uncited product assumption", "No observable recovery path"],
  };
}

function slugFromPath(path: string) {
  return (
    path
      .split("/")
      .pop()
      ?.replace(/\.(svg|mmd)$/i, "") ?? path
  );
}

function titleFromCaption(caption: string, slug: string) {
  const withoutPrefix = caption
    .replace(/^Original diagram:\s*/i, "")
    .replace(/^Decision diagram:\s*/i, "");
  const first = withoutPrefix.split(/\s+[—-]\s+|:/)[0]?.trim();
  return first || slug.replace(/-/g, " ");
}

function phrases(caption: string, topic?: string, capability?: string) {
  const cleaned = caption
    .replace(/^(Original|Decision|Internals) diagram:\s*/i, "")
    .replace(/\([^)]{50,}\)/g, "")
    .trim();
  const parts = cleaned
    .split(/\s+[—-]\s+|;|,\s+(?=[a-zA-Z])/)
    .map((part) => part.trim())
    .filter((part) => part.length > 8);
  const seed = [
    topic ? `${topic.replace(/-/g, " ")} context` : "Fabric architecture context",
    ...parts,
    capability ? `${capability.replace(/-/g, " ")} capability` : "Governed Fabric outcome",
  ];
  return [...new Set(seed)].slice(0, 6);
}

function classify(text: string): DiagramClassification {
  if (/risk|limit|warning|failure|fallback|throttl/i.test(text)) return "warning";
  if (/decision|choose|pattern|strategy|architecture/i.test(text)) return "pattern";
  return "inference";
}

function inferLayer(text: string, index: number): DiagramLayer {
  if (/security|identity|permission|purview|govern/i.test(text)) return "security";
  if (/metadata|schema|catalog|lineage|ontology/i.test(text)) return "metadata";
  if (/monitor|metric|health|telemetry|observ/i.test(text)) return "observability";
  if (/pipeline|event|flow|trigger|orchestrat/i.test(text)) return "orchestration";
  if (/compute|engine|spark|sql|query|cache/i.test(text)) return "compute";
  return layerOrder[index % layerOrder.length] ?? "data";
}

/**
 * Migration fallback for assets with no authored sidecar yet: derive placeholder nodes from the
 * caption. It cannot know the real topology and cannot cite sources, so every node it makes is
 * classified as an inference and carries no evidence. Authoring a sidecar replaces it entirely.
 */
function authoredFromAsset(asset: Asset): AuthoredDiagram {
  const id = slugFromPath(asset.path);
  const caption = asset.caption || id.replace(/-/g, " ");
  const terms = phrases(caption, asset.topic_slug, asset.capability_id);
  const nodes = terms.map((term, index) => {
    const layer = inferLayer(term, index);
    const details = detailsFor(asset.topic_slug, layer, term);
    const target =
      index === 0 && asset.topic_slug
        ? {
            kind: "topic" as const,
            slug: asset.topic_slug,
            label: `Open ${asset.topic_slug.replace(/-/g, " ")}`,
          }
        : index === terms.length - 1 && asset.capability_id
          ? {
              kind: "capability" as const,
              slug: asset.capability_id,
              label: `Open ${asset.capability_id.replace(/-/g, " ")}`,
            }
          : undefined;
    return {
      id: `${id}-node-${index + 1}`,
      label: term.length > 48 ? `${term.slice(0, 45)}…` : term,
      summary: term,
      detail: `This element is part of the ${titleFromCaption(caption, id)} view. Select connected elements to trace how the concern moves through the Fabric architecture.`,
      whyItMatters: `It makes the ${layer} responsibility explicit so implementation and ownership decisions are not hidden in a decorative box.`,
      classification: classify(term),
      layers: [layer],
      evidence: [],
      tags: ["MicrosoftFabric", layer],
      drill: {
        inputs: details.inputs,
        processing: details.processing,
        outputs: details.outputs,
        example: details.example,
        controls: details.controls,
        failureModes: details.failures,
      },
      drillTarget: target,
    };
  });
  const edges = nodes.slice(1).map((node, index) => ({
    id: `${id}-edge-${index + 1}`,
    from: nodes[index]!.id,
    to: node.id,
    layer: node.layers[0] ?? ("data" as DiagramLayer),
    kind: "flow" as const,
  }));
  return {
    id,
    title: titleFromCaption(caption, id),
    purpose: caption,
    accessibleSummary: `${caption}. The interactive view contains ${nodes.length} focusable elements and ${edges.length} directed relationships.`,
    longDescription: `Explore the diagram in reading order, select any element for its responsibility and rationale, or trace upstream and downstream relationships. ${caption}`,
    type: /decision|choos/i.test(caption)
      ? "decision"
      : /internal|engine|lifecycle/i.test(caption)
        ? "internals"
        : "architecture",
    topicSlug: asset.topic_slug,
    capabilityIds: asset.capability_id ? [asset.capability_id] : [],
    revision: asset.interaction_version || "1",
    qaStatus: asset.qa_status || "draft",
    staticPath: `/${asset.path.replace(/^content\//, "")}`,
    nodes,
    edges,
    walkthrough: nodes.map((node, index) => ({
      nodeId: node.id,
      title: `${index + 1}. ${node.label}`,
      explanation: node.summary,
    })),
  };
}

const catalog = new Map(
  (diagramAssets as Asset[]).map((asset) => {
    const slug = slugFromPath(asset.path);
    const authored = sidecars.get(slug) ?? authoredFromAsset(asset);
    return [slug, layoutDiagram(authored)] as const;
  }),
);

/** True when the diagram has a real authored sidecar rather than caption-derived placeholders. */
export function isAuthored(slugOrPath: string) {
  return sidecars.has(slugFromPath(slugOrPath));
}

export function getInteractiveDiagram(slugOrPath: string) {
  return catalog.get(slugFromPath(slugOrPath));
}

export function interactiveDiagramCatalog() {
  return [...catalog.values()];
}

// Server-side seed/publish code uses this readable alias when indexing nodes.
export const allInteractiveDiagrams = interactiveDiagramCatalog;
