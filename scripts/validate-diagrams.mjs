import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  dir = join(root, "content/diagrams");
const assets = JSON.parse(readFileSync(join(dir, "assets.json"), "utf8"));
const failures = [],
  paths = new Set(),
  slugs = new Set(),
  assetsBySlug = new Map();
for (const asset of assets) {
  const path = join(root, asset.path),
    slug = basename(asset.path).replace(/\.(svg|mmd)$/i, "");
  if (paths.has(asset.path)) failures.push(`duplicate manifest path ${asset.path}`);
  if (slugs.has(slug)) failures.push(`duplicate slug ${slug}`);
  paths.add(asset.path);
  slugs.add(slug);
  assetsBySlug.set(slug, asset);
  if (!existsSync(path)) {
    failures.push(`missing ${asset.path}`);
    continue;
  }
  if (!asset.interaction_version) failures.push(`${slug}: missing interaction_version`);
  if (!asset.qa_status || !["draft", "passed", "failed"].includes(asset.qa_status))
    failures.push(`${slug}: invalid qa_status`);
  const svg = readFileSync(path, "utf8"),
    markup = svg.replace(/<!--[\s\S]*?-->/g, ""),
    box = /<svg[^>]*viewBox=["']\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*["']/i.exec(svg);
  if (!box || Number(box[3]) <= 0 || Number(box[4]) <= 0)
    failures.push(`${slug}: missing/invalid viewBox`);
  if (/<script\b|<foreignObject\b|\son[a-z]+\s*=\s*["']|javascript:/i.test(markup))
    failures.push(`${slug}: unsafe executable SVG content`);
  const publicPath = join(root, "public", "diagrams", `${slug}.svg`);
  if (!existsSync(publicPath)) failures.push(`${slug}: missing public/diagrams/${slug}.svg mirror`);
  else if (readFileSync(publicPath, "utf8") !== svg)
    failures.push(`${slug}: content/public SVG mirrors are not byte-identical`);
  const hash = createHash("sha256").update(svg).digest("hex");
  if (asset.static_hash !== hash) failures.push(`${slug}: static_hash does not match SVG bytes`);
  if (!/<title\b[^>]*\bid=["'][^"']+-title["'][^>]*>/i.test(svg))
    failures.push(`${slug}: SVG root needs an identified <title>`);
  if (!/<desc\b[^>]*\bid=["'][^"']+-desc["'][^>]*>/i.test(svg))
    failures.push(`${slug}: SVG root needs an identified <desc>`);
  if (!/<svg\b[^>]*\brole=["']img["'][^>]*\baria-labelledby=["'][^"']+["']/i.test(svg))
    failures.push(`${slug}: SVG root needs role="img" and aria-labelledby`);
}
for (const name of readdirSync(dir).filter((name) => name.endsWith(".svg")))
  if (!paths.has(`content/diagrams/${name}`)) failures.push(`orphan SVG: ${name}`);

/**
 * Authored sidecars (content/diagrams/<slug>.diagram.json) are the semantic/evidence contract for
 * the primary SVG infographic. Enforce src/diagrams/types.ts — most importantly the
 * honesty rule: a node classified `fact` asserts sourced product behaviour, so it must cite
 * evidence, exactly like any other claim in the knowledge base.
 */
const sidecarNames = readdirSync(dir).filter((name) => name.endsWith(".diagram.json"));
const kinds = new Set(["architecture", "decision", "flow", "model", "internals"]);
const classifications = new Set(["fact", "pattern", "inference", "warning"]);
let authored = 0;

for (const name of sidecarNames) {
  const slug = name.replace(/\.diagram\.json$/, "");
  const label = `${slug}.diagram.json`;

  if (!slugs.has(slug)) {
    failures.push(`${label}: no matching entry in assets.json (slug must equal the SVG slug)`);
    continue;
  }

  let doc;
  try {
    doc = JSON.parse(readFileSync(join(dir, name), "utf8"));
  } catch (error) {
    failures.push(`${label}: invalid JSON — ${error.message}`);
    continue;
  }
  authored += 1;

  if (doc.id !== slug) failures.push(`${label}: id "${doc.id}" must equal the slug "${slug}"`);
  if (!kinds.has(doc.type)) failures.push(`${label}: invalid type "${doc.type}"`);
  if (!doc.purpose) failures.push(`${label}: missing purpose`);
  if (!doc.accessibleSummary) failures.push(`${label}: missing accessibleSummary`);
  if (!doc.longDescription) failures.push(`${label}: missing longDescription`);
  if (!doc.revision) failures.push(`${label}: missing revision`);
  else if (String(doc.revision) !== String(assetsBySlug.get(slug)?.interaction_version))
    failures.push(
      `${label}: revision "${doc.revision}" must match manifest interaction_version ` +
        `"${assetsBySlug.get(slug)?.interaction_version}"`,
    );

  const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
  const edges = Array.isArray(doc.edges) ? doc.edges : [];
  if (nodes.length < 2) failures.push(`${label}: needs at least 2 nodes`);

  const ids = new Set();
  for (const node of nodes) {
    if (ids.has(node.id)) failures.push(`${label}: duplicate node id "${node.id}"`);
    ids.add(node.id);

    // Geometry is derived by src/diagrams/layout.ts. Hand-placed boxes are what produced the old
    // uniform-grid mess, so reject them outright rather than silently ignoring them.
    for (const key of ["x", "y", "width", "height"])
      if (key in node)
        failures.push(
          `${label}: node "${node.id}" carries "${key}" — geometry is derived, not authored`,
        );

    if (!classifications.has(node.classification))
      failures.push(`${label}: node "${node.id}" invalid classification "${node.classification}"`);

    // The honesty contract: an unsourced fact is the exact failure this system exists to prevent.
    if (node.classification === "fact" && !(node.evidence?.length > 0))
      failures.push(`${label}: node "${node.id}" is classified "fact" but cites no evidence`);

    for (const item of node.evidence ?? []) {
      if (!item.sourceKey) {
        failures.push(`${label}: node "${node.id}" has evidence with no sourceKey`);
      } else if (!existsSync(join(root, "content", "sources", `${item.sourceKey}.json`))) {
        failures.push(`${label}: node "${node.id}" cites unknown sourceKey "${item.sourceKey}"`);
      }
    }

    // A metric with a sourceKey asserts a sourced product figure; without one it is pattern guidance.
    for (const metric of node.drill?.metrics ?? [])
      if (!metric.label || !metric.value)
        failures.push(`${label}: node "${node.id}" has a malformed metric`);

    const drill = node.drill;
    if (!drill?.inputs?.length || !drill?.processing?.length || !drill?.outputs?.length)
      failures.push(`${label}: node "${node.id}" drill needs inputs, processing, and outputs`);
    if (!drill?.example) failures.push(`${label}: node "${node.id}" drill needs a worked example`);
    if (!drill?.controls?.length)
      failures.push(`${label}: node "${node.id}" drill needs at least one control`);
    if (!drill?.failureModes?.length)
      failures.push(`${label}: node "${node.id}" drill needs at least one failure mode`);
  }

  const svg = readFileSync(join(dir, `${slug}.svg`), "utf8");
  const regionIds = [...svg.matchAll(/\bdata-node-id=["']([^"']+)["']/g)].map((match) => match[1]);
  for (const id of ids) {
    const count = regionIds.filter((candidate) => candidate === id).length;
    if (count !== 1)
      failures.push(`${label}: node "${id}" must map to exactly one SVG region (found ${count})`);
  }
  for (const id of regionIds)
    if (!ids.has(id)) failures.push(`${label}: SVG region references unknown node "${id}"`);
  for (const match of svg.matchAll(/<[^>]+\bdata-node-id=["']([^"']+)["'][^>]*>/g))
    if (!/\btabindex=["']0["']/.test(match[0]) || !/\baria-label=["'][^"']+["']/.test(match[0]))
      failures.push(`${label}: SVG region "${match[1]}" must be focusable and labelled`);

  for (const edge of edges) {
    if (!ids.has(edge.from))
      failures.push(`${label}: edge "${edge.id}" from unknown node "${edge.from}"`);
    if (!ids.has(edge.to))
      failures.push(`${label}: edge "${edge.id}" to unknown node "${edge.to}"`);
    // A decorative arrow says nothing. Every edge states a relationship.
    if (!edge.label) failures.push(`${label}: edge "${edge.id}" has no label`);
  }

  // A decision tree that renders as a straight line is a bug, not a diagram.
  if (doc.type === "decision" && !edges.some((edge) => edge.kind === "branch"))
    failures.push(
      `${label}: type "decision" but no edge has kind "branch" — it would render as a line`,
    );

  for (const step of doc.walkthrough ?? [])
    if (!ids.has(step.nodeId))
      failures.push(`${label}: walkthrough step references unknown node "${step.nodeId}"`);
}

if (failures.length) {
  console.error(`Diagram validation failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `Diagram validation passed: ${assets.length} registered diagrams, ` +
    `${authored} with authored evidence sidecars, ` +
    `${assets.length - authored} missing sidecars.`,
);
