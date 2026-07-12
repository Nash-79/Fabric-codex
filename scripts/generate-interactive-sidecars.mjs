import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const assets = JSON.parse(readFileSync(resolve(root, "content/diagrams/assets.json"), "utf8"));
const layers = [
  "data",
  "orchestration",
  "compute",
  "metadata",
  "governance",
  "security",
  "observability",
];

const clean = (value) =>
  value.replace(/^(Original|Decision|Internals) (interactive )?diagram:\s*/i, "").trim();
const slug = (path) => basename(path).replace(/\.(svg|mmd)$/i, "");
const short = (value, max = 68) =>
  value.length > max ? `${value.slice(0, max - 1).trim()}…` : value;
const layerFor = (value, index) => {
  if (/security|identity|permission|purview|govern/i.test(value)) return "security";
  if (/metadata|schema|catalog|lineage|ontology|model/i.test(value)) return "metadata";
  if (/monitor|metric|health|telemetry|observ/i.test(value)) return "observability";
  if (/pipeline|event|flow|trigger|orchestrat/i.test(value)) return "orchestration";
  if (/compute|engine|spark|sql|query|cache|warehouse/i.test(value)) return "compute";
  return layers[index % layers.length];
};
const parts = (caption, topic, capability) => {
  const candidates = clean(caption)
    .split(/\s+[—–]\s+|;|,\s+(?=[A-Za-z])/)
    .map((item) => item.trim())
    .filter((item) => item.length > 10);
  return [
    ...new Set([
      topic ? `${topic.replace(/-/g, " ")} boundary` : "Fabric architecture boundary",
      ...candidates,
      capability ? `${capability.replace(/-/g, " ")} governed outcome` : "Governed Fabric outcome",
    ]),
  ].slice(0, 7);
};

let created = 0,
  preserved = 0;
for (const asset of assets) {
  const id = slug(asset.path),
    target = resolve(root, `content/diagrams/${id}.diagram.json`);
  if (existsSync(target)) {
    preserved += 1;
    continue;
  }
  const caption = asset.caption || id.replace(/-/g, " "),
    labels = parts(caption, asset.topic_slug, asset.capability_id);
  const isDecision = /decision|choose|choosing|vs\b|matrix/i.test(caption);
  const nodes = labels.map((label, index) => {
    const layer = layerFor(label, index),
      final = index === labels.length - 1;
    return {
      id: `step-${index + 1}`,
      label: short(label),
      summary: `${short(label, 120)} in the ${clean(caption)} architecture.`,
      detail: `This element makes the ${layer} responsibility explicit. Follow its incoming and outgoing relationships to verify the complete hand-off rather than treating it as an isolated decorative box.`,
      whyItMatters: `Implementation ownership, recovery, and evidence must be visible at this ${layer} boundary before the pattern is reused.`,
      classification: /risk|warning|failure|fallback|throttl/i.test(label) ? "warning" : "pattern",
      layers: [layer],
      evidence: [],
      tags: ["MicrosoftFabric", "DataArchitecture", layer],
      drill: {
        inputs: [
          "Upstream data or metadata contract",
          `${layer} service objective`,
          "Named owner and recovery expectation",
        ],
        processing: [
          `Apply the ${short(label, 90)} responsibility`,
          "Record state, quality, and evidence",
          "Make retries deterministic before handing off",
        ],
        outputs: [
          "Versioned downstream contract",
          "Observable completion signal",
          "Reconciliation or failure record",
        ],
        example: `Trace one representative data product through ${short(label, 100)}: record what arrives, the exact Fabric responsibility applied, the output contract, and how an operator safely retries a failed run.`,
        controls: [
          "Identity and access boundary",
          "Configuration and schema version",
          "Quality, replay, and recovery policy",
        ],
        failureModes: [
          "Implicit ownership or undocumented hand-off",
          "Product behavior asserted without a cited source",
          "A partial failure has no replay or reconciliation path",
        ],
      },
      ...(index === 0 && asset.topic_slug
        ? {
            drillTarget: {
              kind: "topic",
              slug: asset.topic_slug,
              label: `Open ${asset.topic_slug.replace(/-/g, " ")}`,
            },
          }
        : {}),
      ...(final && asset.capability_id
        ? {
            drillTarget: {
              kind: "capability",
              slug: asset.capability_id,
              label: `Open ${asset.capability_id.replace(/-/g, " ")}`,
            },
          }
        : {}),
    };
  });
  const edges = [];
  for (let index = 1; index < nodes.length; index += 1)
    edges.push({
      id: `edge-${index}`,
      from: nodes[index - 1].id,
      to: nodes[index].id,
      label: isDecision
        ? index === 1
          ? "yes — follow this criterion"
          : "then evaluate"
        : "hands governed output to",
      layer: nodes[index].layers[0],
      kind: isDecision && index <= 2 ? "branch" : "flow",
    });
  if (isDecision && nodes.length > 2)
    edges.push({
      id: "edge-alternative",
      from: nodes[0].id,
      to: nodes[2].id,
      label: "no — follow the alternative",
      layer: nodes[2].layers[0],
      kind: "branch",
    });
  const document = {
    id,
    title: short(clean(caption), 110),
    purpose: caption,
    accessibleSummary: `An interactive ${isDecision ? "decision" : "architecture"} infographic with ${nodes.length} selectable elements. Every element drills into inputs, processing, outputs, a worked example, controls, and failure modes.`,
    longDescription: `Read from the first architecture boundary through each labelled relationship to the governed outcome. Select any element for a detailed end-to-end infographic, then trace upstream or downstream to understand the complete implementation path. ${caption}`,
    type: isDecision
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
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  created += 1;
}
console.log(
  `Interactive sidecars: ${created} created, ${preserved} authored definitions preserved.`,
);
