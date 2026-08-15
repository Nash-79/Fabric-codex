import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const assets = JSON.parse(readFileSync(join(root, "content/diagrams/assets.json"), "utf8"));

console.log(`Starting catalog-wide audit across ${assets.length} diagrams...\n`);

const issues = [];
const scores = [];

for (let i = 0; i < assets.length; i++) {
  const asset = assets[i];
  const slug = basename(asset.path, ".svg");
  process.stdout.write(`[${i + 1}/${assets.length}] Auditing ${slug}... `);
  try {
    const output = execSync(`node scripts/review-diagram.mjs --slug ${slug}`, {
      cwd: root,
      encoding: "utf8",
    });

    const scoreMatch = output.match(/Quality Score:\s*(\d+)\/100/);
    const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
    scores.push({ slug, score });

    if (score < 100) {
      console.log(`❌ ${score}/100`);
      issues.push({ slug, score, output });
    } else {
      console.log(`✅ 100/100`);
    }
  } catch (err) {
    console.log(`⚠️ ERROR`);
    issues.push({ slug, score: 0, output: err.message });
  }
}

console.log("\n" + "=".repeat(80));
console.log(`AUDIT COMPLETE: ${scores.filter(s => s.score === 100).length}/${assets.length} diagrams scored 100/100.`);
console.log("=".repeat(80));

if (issues.length > 0) {
  console.log(`\nDiagrams requiring review or polish (${issues.length}):`);
  for (const item of issues) {
    console.log(`\n--- ${item.slug} (${item.score}/100) ---`);
    console.log(item.output.trim());
  }
} else {
  console.log("\n🎉 All diagrams in the catalog scored 100/100 with 0 collisions and 0 overflows!");
}
