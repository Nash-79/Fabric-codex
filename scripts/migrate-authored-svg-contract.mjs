import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const contentDir = join(root, "content", "diagrams");
const publicDir = join(root, "public", "diagrams");
const assetsPath = join(contentDir, "assets.json");
const assets = JSON.parse(readFileSync(assetsPath, "utf8"));

const stopWords = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "via",
  "with",
  "warning",
]);

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function plain(value) {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|apos);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(
    plain(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((word) => word.length > 2 && !stopWords.has(word)),
  );
}

function addRootAccessibility(svg, diagram) {
  const titleId = `${diagram.id}-title`;
  const descId = `${diagram.id}-desc`;
  svg = svg.replace(/<svg\b([^>]*)>/i, (match, attrs) => {
    let next = attrs
      .replace(/\srole=["'][^"']*["']/i, "")
      .replace(/\saria-labelledby=["'][^"']*["']/i, "")
      .replace(/\sdata-diagram-id=["'][^"']*["']/i, "");
    return `<svg${next} role="img" aria-labelledby="${titleId} ${descId}" data-diagram-id="${xml(diagram.id)}">`;
  });

  const rootEnd = svg.indexOf(">");
  const firstTitle = /<title(?:\s[^>]*)?>[\s\S]*?<\/title>/i.exec(svg.slice(rootEnd + 1));
  if (firstTitle) {
    const start = rootEnd + 1 + firstTitle.index;
    svg =
      svg.slice(0, start) +
      `<title id="${titleId}">${xml(diagram.title)}</title>` +
      svg.slice(start + firstTitle[0].length);
  } else {
    svg = `${svg.slice(0, rootEnd + 1)}\n  <title id="${titleId}">${xml(diagram.title)}</title>${svg.slice(rootEnd + 1)}`;
  }

  const descPattern = /<desc(?:\s[^>]*)?>[\s\S]*?<\/desc>/i;
  const firstDesc = descPattern.exec(svg.slice(rootEnd + 1));
  if (firstDesc) {
    const start = rootEnd + 1 + firstDesc.index;
    svg =
      svg.slice(0, start) +
      `<desc id="${descId}">${xml(diagram.accessibleSummary)}</desc>` +
      svg.slice(start + firstDesc[0].length);
  } else {
    const titleEnd = svg.indexOf("</title>", rootEnd) + "</title>".length;
    svg = `${svg.slice(0, titleEnd)}\n  <desc id="${descId}">${xml(diagram.accessibleSummary)}</desc>${svg.slice(titleEnd)}`;
  }
  return svg;
}

function addNodeRegions(svg, diagram) {
  const mapped = new Set(
    [...svg.matchAll(/\bdata-node-id=["']([^"']+)["']/g)].map((match) => match[1]),
  );
  const textPattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  const candidates = [...svg.matchAll(textPattern)].map((match) => ({
    start: match.index,
    length: match[0].length,
    attrs: match[1],
    body: match[2],
    text: plain(match[2]),
  }));
  const used = new Set();
  const replacements = [];

  for (const node of diagram.nodes) {
    if (mapped.has(node.id)) continue;
    const wanted = tokens(`${node.label} ${node.summary}`);
    let bestIndex = -1;
    let bestScore = -Infinity;
    candidates.forEach((candidate, index) => {
      if (used.has(index) || !candidate.text) return;
      const present = tokens(candidate.text);
      let score = 0;
      for (const word of wanted) if (present.has(word)) score += 10;
      if (candidate.text.toLowerCase().includes(node.label.toLowerCase())) score += 100;
      score += Math.min(candidate.text.length, 80) / 100;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) throw new Error(`${diagram.id}: no text region available for ${node.id}`);
    used.add(bestIndex);
    const candidate = candidates[bestIndex];
    const attrs = candidate.attrs
      .replace(/\sdata-node-id=["'][^"']*["']/i, "")
      .replace(/\stabindex=["'][^"']*["']/i, "")
      .replace(/\saria-label=["'][^"']*["']/i, "");
    const title = `<title data-node-tooltip="true">${xml(node.label)} — ${xml(node.summary)}</title>`;
    replacements.push({
      start: candidate.start,
      length: candidate.length,
      value: `<text${attrs} data-node-id="${xml(node.id)}" tabindex="0" aria-label="${xml(node.label)}">${title}${candidate.body}</text>`,
    });
  }

  for (const replacement of replacements.sort((a, b) => b.start - a.start))
    svg =
      svg.slice(0, replacement.start) +
      replacement.value +
      svg.slice(replacement.start + replacement.length);
  return svg;
}

for (const asset of assets) {
  const slug = basename(asset.path).replace(/\.svg$/i, "");
  const sidecarPath = join(contentDir, `${slug}.diagram.json`);
  const svgPath = join(contentDir, `${slug}.svg`);
  const publicPath = join(publicDir, `${slug}.svg`);
  const diagram = JSON.parse(readFileSync(sidecarPath, "utf8"));
  let svg = readFileSync(svgPath, "utf8");
  svg = addRootAccessibility(svg, diagram);
  svg = addNodeRegions(svg, diagram);
  if (!svg.endsWith("\n")) svg += "\n";
  writeFileSync(svgPath, svg);
  writeFileSync(publicPath, svg);
  asset.static_hash = createHash("sha256").update(svg).digest("hex");
  asset.accessible_summary = diagram.accessibleSummary;
  asset.supported_layers = [...new Set(diagram.nodes.flatMap((node) => node.layers))];
  asset.interaction_version = diagram.revision;
}

writeFileSync(assetsPath, `${JSON.stringify(assets, null, 2)}\n`);
console.log(`Migrated ${assets.length} authored SVG contracts.`);
