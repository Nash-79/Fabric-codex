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
  const officialIconUses = [
    ...svg.matchAll(/<[^>]+\bdata-official-icon=["']microsoft["'][^>]*>/gi),
  ];
  for (const match of officialIconUses)
    if (!/\bdata-icon-name=["'][^"']+["']/i.test(match[0]))
      failures.push(`${slug}: official Microsoft icon use is missing data-icon-name`);
  if (officialIconUses.length > 0 && !existsSync(join(dir, "icons", "microsoft", "NOTICE.md")))
    failures.push(
      `${slug}: official Microsoft icons require content/diagrams/icons/microsoft/NOTICE.md`,
    );
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
let semanticRegions = 0;
let mappedRegions = 0;

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
  // Editorial Experience Revamp Phase 5: optional inline embed width mode, additive/defaults
  // to "standard" when absent.
  if (doc.layoutHint && !["standard", "wide", "full-bleed"].includes(doc.layoutHint))
    failures.push(`${label}: invalid layoutHint "${doc.layoutHint}"`);

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

  // Two node ids sharing one region's geometry means at least one is a caption-derived fallback
  // rather than a hit region over the shape it describes: the stacked regions fire each other's
  // tooltips and the real node is left with nothing focusable. Each id resolving to exactly one
  // region (checked above) does not catch this — the geometry has to be distinct too.
  //
  // Scoped to each node's OWN <g data-node-id="..."> block (depth-aware, not a lazy forward scan)
  // so a node's shape is never confused with a later, unrelated node's shape. Covers rect, circle,
  // ellipse, and path (via its 'd' bounding box) — not rect alone. rect-only previously silently
  // skipped any node whose primary shape is one of the other three; ~1,400 non-rect shapes exist
  // across the corpus today, so that gap was real, not theoretical.
  const regionGeometry = new Map();
  const nodeGroupRe = /<g\b[^>]*\bdata-node-id=["']([^"']+)["'][^>]*>/g;
  let groupMatch;
  while ((groupMatch = nodeGroupRe.exec(svg))) {
    const id = groupMatch[1];
    const rest = svg.slice(groupMatch.index);
    // Depth-aware scan for this <g>'s own matching closing tag, so nested/sibling groups don't
    // leak this node's shape search into a different node's markup.
    const tagRe = /<\/?g\b[^>]*>/g;
    let depth = 0;
    let endIdx = -1;
    let tagMatch;
    while ((tagMatch = tagRe.exec(rest))) {
      if (tagMatch[0].startsWith("</g")) {
        depth -= 1;
        if (depth === 0) {
          endIdx = tagMatch.index;
          break;
        }
      } else if (!tagMatch[0].endsWith("/>")) {
        depth += 1;
      }
    }
    const block = endIdx > -1 ? rest.slice(0, endIdx) : rest;

    const rect =
      /<rect\b[^>]*\bx=["']([\d.-]+)["'][^>]*\by=["']([\d.-]+)["'][^>]*\bwidth=["']([\d.-]+)["'][^>]*\bheight=["']([\d.-]+)["']/.exec(
        block,
      );
    const circle =
      !rect &&
      /<circle\b[^>]*\bcx=["']([\d.-]+)["'][^>]*\bcy=["']([\d.-]+)["'][^>]*\br=["']([\d.-]+)["']/.exec(
        block,
      );
    const ellipse =
      !rect &&
      !circle &&
      /<ellipse\b[^>]*\bcx=["']([\d.-]+)["'][^>]*\bcy=["']([\d.-]+)["'][^>]*\brx=["']([\d.-]+)["'][^>]*\bry=["']([\d.-]+)["']/.exec(
        block,
      );
    // Path bounding box: cheap heuristic over every numeric pair in the 'd' attribute rather than
    // a full path parser — good enough to detect an exact-duplicate shape, which is what this
    // check exists to catch (a copy-pasted path is byte-identical, so its numeric extent is too).
    const path = !rect && !circle && !ellipse && /<path\b[^>]*\bd=["']([^"']+)["']/.exec(block);
    // Transform-positioned rect: width/height only, positioned via a wrapping
    // <g transform="translate(x, y)"> rather than its own x/y attributes (e.g. an inline
    // "commit log" chip). Combine the translate with the rect's width/height for an absolute key.
    const translatedRect =
      !rect &&
      !circle &&
      !ellipse &&
      !path &&
      (() => {
        const t =
          /<g\b[^>]*\btransform=["']translate\(\s*([\d.-]+)[\s,]+([\d.-]+)\s*\)["'][^>]*>\s*(?:<[^>]+>\s*)*?<rect\b[^>]*\bwidth=["']([\d.-]+)["'][^>]*\bheight=["']([\d.-]+)["']/.exec(
            block,
          );
        return t;
      })();
    // Last resort: a text-only annotation node with no shape at all — key on the text's own
    // position, which is still enough to detect two nodes rendering at the exact same spot.
    const textOnly =
      !rect &&
      !circle &&
      !ellipse &&
      !path &&
      !translatedRect &&
      /<text\b[^>]*\bx=["']([\d.-]+)["'][^>]*\by=["']([\d.-]+)["']/.exec(block);

    let key = null;
    if (rect) key = `rect:${rect[1]},${rect[2]},${rect[3]},${rect[4]}`;
    else if (circle) key = `circle:${circle[1]},${circle[2]},${circle[3]}`;
    else if (ellipse) key = `ellipse:${ellipse[1]},${ellipse[2]},${ellipse[3]},${ellipse[4]}`;
    else if (path) key = `path:${path[1]}`;
    else if (translatedRect)
      key = `rect:${translatedRect[1]},${translatedRect[2]},${translatedRect[3]},${translatedRect[4]}`;
    else if (textOnly) key = `text:${textOnly[1]},${textOnly[2]}`;

    if (key) {
      if (!regionGeometry.has(key)) regionGeometry.set(key, []);
      regionGeometry.get(key).push(id);
    } else {
      failures.push(
        `${label}: node "${id}" has no rect/circle/ellipse/path/text found in its own <g> — ` +
          `geometry cannot be verified distinct from other nodes`,
      );
    }
  }
  for (const [key, sharing] of regionGeometry)
    if (sharing.length > 1)
      failures.push(
        `${label}: nodes ${sharing.map((id) => `"${id}"`).join(" and ")} share one SVG region ` +
          `[${key}] — each node needs its own hit region over the shape it describes`,
      );
  for (const match of svg.matchAll(
    /<([a-z][\w:-]*)\b[^>]*\bdata-node-id=["']([^"']+)["'][^>]*>/gi,
  )) {
    mappedRegions += 1;
    if (match[1].toLowerCase() === "g") semanticRegions += 1;
    if (!/\btabindex=["']0["']/.test(match[0]) || !/\baria-label=["'][^"']+["']/.test(match[0]))
      failures.push(`${label}: SVG region "${match[2]}" must be focusable and labelled`);
    if (assetsBySlug.get(slug)?.qa_status === "passed" && match[1].toLowerCase() !== "g")
      failures.push(
        `${label}: passed asset region "${match[2]}" must be a semantic <g>, not <${match[1]}>`,
      );
  }

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
    `${assets.length - authored} missing sidecars; ` +
    `${semanticRegions}/${mappedRegions} node regions use semantic groups.`,
);
