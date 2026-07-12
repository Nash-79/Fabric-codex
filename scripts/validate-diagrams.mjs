import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  dir = join(root, "content/diagrams");
const assets = JSON.parse(readFileSync(join(dir, "assets.json"), "utf8"));
const failures = [],
  paths = new Set(),
  slugs = new Set();
for (const asset of assets) {
  const path = join(root, asset.path),
    slug = basename(asset.path).replace(/\.(svg|mmd)$/i, "");
  if (paths.has(asset.path)) failures.push(`duplicate manifest path ${asset.path}`);
  if (slugs.has(slug)) failures.push(`duplicate slug ${slug}`);
  paths.add(asset.path);
  slugs.add(slug);
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
}
for (const name of readdirSync(dir).filter((name) => name.endsWith(".svg")))
  if (!paths.has(`content/diagrams/${name}`)) failures.push(`orphan SVG: ${name}`);
if (failures.length) {
  console.error(`Diagram validation failed (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Diagram validation passed: ${assets.length} registered interactive diagrams.`);
