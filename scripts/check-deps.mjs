#!/usr/bin/env node
// Dependency freshness check for the packages Atlas deliberately tracks.
//
// Reports only — upgrades are applied locally, tested, and committed by a human.
// See docs/dependencies.md for the upgrade gate. Prereleases are never offered,
// and versions published within the last 24h are "held" (the supply-chain guard
// bunfig.toml declares but npm does not apply).
//
// Usage:
//   node scripts/check-deps.mjs           # human-readable report
//   node scripts/check-deps.mjs --brief   # only packages needing attention
//   node scripts/check-deps.mjs --json    # machine-readable

import { collectDepUpdates, upgradeCommand } from "./lib/dep-updates.mjs";

const args = new Set(process.argv.slice(2));
const brief = args.has("--brief");
const asJson = args.has("--json");

function textReport(result) {
  const lines = [];
  for (const pkg of result.packages) {
    if (brief && (pkg.state === "current" || pkg.state === "unknown")) continue;
    if (pkg.state === "current") {
      lines.push(`  ok    ${pkg.name} ${pkg.installed} (current)`);
    } else if (pkg.state === "update") {
      lines.push(`  ${pkg.major ? "MAJOR" : "minor"} ${pkg.name} ${pkg.installed} → ${pkg.latest}`);
      lines.push(`        ${upgradeCommand(pkg)}`);
    } else if (pkg.state === "held") {
      lines.push(
        `  held  ${pkg.name} ${pkg.latest} published <24h ago — holding per supply-chain guard`,
      );
    } else {
      lines.push(`  ?     ${pkg.name} — registry unavailable`);
    }
  }
  if (!lines.length) return "check-deps: all watched dependencies current\n";
  return `check-deps: ${result.updates} update(s), ${result.held} held\n${lines.join("\n")}\n`;
}

async function main() {
  const result = await collectDepUpdates();
  process.stdout.write(asJson ? `${JSON.stringify(result, null, 2)}\n` : textReport(result));
}

main().catch((err) => {
  // Never fail a session over dependency checking; offline is not a finding.
  process.stderr.write(`check-deps: ${err.message}\n`);
  process.exitCode = 0;
});
