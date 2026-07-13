import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const dir = join(root, "content/diagrams");
const assetsPath = join(dir, "assets.json");

const assets = JSON.parse(readFileSync(assetsPath, "utf8"));
let changed = false;

for (const asset of assets) {
  const svgPath = join(root, asset.path); // asset.path is like "content/diagrams/<slug>.svg"
  if (!existsSync(svgPath)) {
    console.warn("missing file:", asset.path);
    continue;
  }
  let svg = readFileSync(svgPath, "utf8");

  // Normalize to LF line endings
  if (svg.includes("\r\n")) {
    svg = svg.replace(/\r\n/g, "\n");
    writeFileSync(svgPath, svg, "utf8");
    console.log(`normalized line endings to LF: ${svgPath}`);
    changed = true;
  }

  const hash = createHash("sha256").update(svg).digest("hex");
  if (asset.static_hash !== hash) {
    console.log(`update hash: ${asset.path} ${asset.static_hash || "(empty)"} -> ${hash}`);
    asset.static_hash = hash;
    changed = true;
  }

  // Ensure public mirror matches content
  const publicPath = join(
    root,
    "public",
    "diagrams",
    `${basename(asset.path).replace(/\.(svg|mmd)$/i, "")}.svg`,
  );
  if (existsSync(publicPath)) {
    let pub = readFileSync(publicPath, "utf8");
    if (pub.includes("\r\n")) {
      pub = pub.replace(/\r\n/g, "\n");
      writeFileSync(publicPath, pub, "utf8");
      console.log(`normalized line endings to LF in mirror: ${publicPath}`);
      changed = true;
    }
    if (pub !== svg) {
      console.log(`mirrors differ: ${publicPath} — updating from content/diagrams`);
      writeFileSync(publicPath, svg, "utf8");
      changed = true;
    }
  } else {
    console.log(`public mirror missing — creating ${publicPath}`);
    writeFileSync(publicPath, svg, "utf8");
    changed = true;
  }
}

if (changed) {
  // Normalize JSON formatting to LF line endings
  const newAssetsJson = JSON.stringify(assets, null, 2).replace(/\r\n/g, "\n") + "\n";
  writeFileSync(assetsPath, newAssetsJson, "utf8");
  console.log("assets.json updated; please review and commit the changes.");
} else {
  console.log("No changes needed.");
}
