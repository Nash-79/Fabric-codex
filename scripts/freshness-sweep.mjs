#!/usr/bin/env node
/**
 * Freshness Sweep & Gap-Closing Automation (WP3.3)
 *
 * Scans content items, roadmap items, and knowledge gaps (via scripts/gaps.mjs)
 * to draft review and ingestion items into content/queue.md or stdout.
 *
 * Invariant: Drafts ONLY into queue. Never modifies published KB tables without human review.
 *
 * Usage:
 *   node scripts/freshness-sweep.mjs             # report freshness findings and gap draft suggestions
 *   node scripts/freshness-sweep.mjs --write     # append new high-priority gap drafts to content/queue.md
 *   node scripts/freshness-sweep.mjs --json      # machine-readable output
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const writeToQueue = args.has("--write");
const asJson = args.has("--json");

const QUEUE_FILE = "content/queue.md";

export function analyzeFreshnessAndGaps(rootDir = process.cwd()) {
  // 1. Run gaps analyzer
  let gapsData = { placeholders: [], byDoc: {} };
  try {
    const raw = execSync("node scripts/gaps.mjs --json", { cwd: rootDir, encoding: "utf8" });
    gapsData = JSON.parse(raw);
  } catch (err) {
    console.error("Warning: Could not invoke scripts/gaps.mjs --json:", err.message);
  }

  // 2. Read existing queue to deduplicate
  const existingQueue = existsSync(join(rootDir, QUEUE_FILE))
    ? readFileSync(join(rootDir, QUEUE_FILE), "utf8")
    : "";

  const candidateDrafts = [];
  const freshnessAlerts = [];

  // 3. Process gaps into suggested search queries
  for (const item of gapsData.placeholders ?? []) {
    const topic = item.slug.replace(/-/g, " ");
    const heading = item.subheading.toLowerCase();
    const query = `Microsoft Fabric ${topic} ${heading} architecture internals`;
    const targetUrl = `https://learn.microsoft.com/en-us/fabric/`;

    const queueLine = `[ ] ${query} — ${targetUrl} <!-- gap:${item.slug}:${item.subheading} -->`;
    const alreadyQueued =
      existingQueue.includes(item.slug) && existingQueue.includes(item.subheading);

    candidateDrafts.push({
      slug: item.slug,
      kind: item.kind,
      subheading: item.subheading,
      suggestedQuery: query,
      suggestedUrl: targetUrl,
      alreadyQueued,
      queueLine,
    });
  }

  return {
    totalPlaceholders: gapsData.placeholders?.length ?? 0,
    candidateDrafts,
    freshnessAlerts,
  };
}

function main() {
  const analysis = analyzeFreshnessAndGaps();

  if (asJson) {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  console.log("=== Fabric Atlas Freshness & Gap Analysis (WP3.3) ===");
  console.log(`Total Internals Placeholders: ${analysis.totalPlaceholders}`);
  console.log(`Candidate Gap-Closing Drafts: ${analysis.candidateDrafts.length}`);

  const unqueued = analysis.candidateDrafts.filter((c) => !c.alreadyQueued);
  console.log(`Unqueued Gap Items: ${unqueued.length}`);

  if (unqueued.length > 0) {
    console.log("\nProposed Queue Additions:");
    for (const draft of unqueued.slice(0, 10)) {
      console.log(`  - [${draft.slug}] ${draft.subheading} -> Query: "${draft.suggestedQuery}"`);
    }
    if (unqueued.length > 10) {
      console.log(`  ... and ${unqueued.length - 10} more.`);
    }
  }

  if (writeToQueue && unqueued.length > 0) {
    const queuePath = join(process.cwd(), QUEUE_FILE);
    const existing = existsSync(queuePath)
      ? readFileSync(queuePath, "utf8")
      : "# Ingestion Queue\n";
    const linesToAdd = unqueued.map((u) => u.queueLine).join("\n");
    writeFileSync(
      queuePath,
      `${existing.trim()}\n\n## Automated Gap-Closing Drafts\n${linesToAdd}\n`,
    );
    console.log(
      `\nWrote ${unqueued.length} candidate drafts to ${QUEUE_FILE} (human review pending).`,
    );
  }
}

if (process.argv[1]?.endsWith("freshness-sweep.mjs")) {
  main();
}
