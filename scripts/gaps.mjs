#!/usr/bin/env node
// The gap document, derived from the files — never committed, so it cannot drift.
// Truth = *Coming soon* markers in ## Internals sections; ledger = content/queue.md.
import { existsSync, readFileSync } from "node:fs";
import { collectInternalsGaps, internalsGapIssues } from "./lib/internals-gaps.mjs";

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const brief = args.has("--brief");
const asMarkdown = args.has("--markdown");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (!process.env[key]) {
        process.env[key] = rest.join("=").replace(/^['"]|['"]$/g, "");
      }
    }
  }
}

function envValue(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return "";
}

async function rest(base, key, path) {
  const res = await fetch(`${base.replace(/\/$/, "")}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function publishedDrift(gaps) {
  const url = envValue("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = envValue("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) return { checked: false, drift: [] };
  const items = await rest(
    url,
    key,
    "content_items?select=kind,slug,body_md&active=eq.true&status=eq.published",
  );
  const published = new Map(items.map((item) => [`${item.kind}:${item.slug}`, item.body_md ?? ""]));
  const drift = [];
  const localIdentities = new Set(
    gaps.placeholders.map((gap) => `${gap.kind.replace(/s$/, "")}:${gap.slug}`),
  );
  for (const [identity, body] of published) {
    const publishedHasGap = /\*Coming soon|\bComing soon\b/.test(body);
    const localHasGap = localIdentities.has(identity);
    if (publishedHasGap !== localHasGap) {
      drift.push({
        identity,
        message: publishedHasGap
          ? "published body still shows a placeholder the local file has closed — republish"
          : "local file has a placeholder the published body lacks — republish",
      });
    }
  }
  return { checked: true, drift };
}

function totals(gaps) {
  return {
    placeholders: gaps.placeholders.length,
    docsWithGaps: Object.keys(gaps.byDoc).length,
    queuedLines: gaps.queued.length,
    untracked: gaps.untracked.length,
    falseAssertions: gaps.untracked.filter((gap) => gap.trackedAssertion).length,
    stale: gaps.stale.length,
    workloadSpecific: gaps.workloadSpecific.length,
  };
}

function textReport(gaps, drift, markdown) {
  const h = (text) => (markdown ? `## ${text}` : text);
  const lines = [
    markdown
      ? "# Fabric Atlas — internals gap inventory (generated)"
      : "Fabric Atlas internals gaps",
  ];
  const sums = totals(gaps);
  lines.push(
    `Totals: ${sums.placeholders} placeholder(s) in ${sums.docsWithGaps} doc(s), ${sums.untracked} untracked (${sums.falseAssertions} false-assertion), ${sums.stale} stale queue line(s), ${sums.workloadSpecific} workload-specific (not gaps)`,
  );

  const falseAssertions = gaps.untracked.filter((gap) => gap.trackedAssertion);
  const honest = gaps.untracked.filter((gap) => !gap.trackedAssertion);
  if (gaps.untracked.length) {
    lines.push("", h(`Untracked placeholders (${gaps.untracked.length})`));
    for (const gap of [...falseAssertions, ...honest])
      lines.push(
        `- ${gap.slug} / ${gap.subheading}${gap.trackedAssertion ? " — FALSE ASSERTION: prose claims it is tracked" : ""} (${gap.file})`,
      );
  }
  if (gaps.stale.length) {
    lines.push(
      "",
      h(`Stale queue lines (${gaps.stale.length}) — gap closed, ledger still chasing it`),
    );
    for (const entry of gaps.stale)
      lines.push(`- queue.md:${entry.lineNumber} ${entry.slug} / ${entry.subheading}`);
  }
  if (!brief) {
    const synced = {};
    for (const [slug, doc] of Object.entries(gaps.byDoc)) {
      const inSync = doc.gaps.filter((gap) => gap.queued).map((gap) => gap.subheading);
      if (inSync.length) synced[slug] = inSync;
    }
    if (Object.keys(synced).length) {
      lines.push(
        "",
        h(`In sync (${Object.keys(synced).length} doc(s)) — placeholder + queue line agree`),
      );
      for (const [slug, heads] of Object.entries(synced))
        lines.push(`- ${slug}: ${heads.join(", ")}`);
    }
    if (gaps.workloadSpecific.length) {
      const bySlug = {};
      for (const entry of gaps.workloadSpecific) (bySlug[entry.slug] ??= []).push(entry.subheading);
      lines.push(
        "",
        h(`Workload-specific (${gaps.workloadSpecific.length}) — not gaps, never queued`),
      );
      for (const [slug, heads] of Object.entries(bySlug))
        lines.push(`- ${slug}: ${heads.join(", ")}`);
    }
  }
  if (gaps.unparseable.length) {
    lines.push("", h(`Unparseable ledger lines (${gaps.unparseable.length})`));
    for (const entry of gaps.unparseable) lines.push(`- queue.md:${entry.lineNumber} ${entry.raw}`);
  }
  if (drift.checked && drift.drift.length) {
    lines.push("", h(`Published-vs-local drift (${drift.drift.length})`));
    for (const entry of drift.drift) lines.push(`- ${entry.identity}: ${entry.message}`);
  } else if (!drift.checked && !brief) {
    lines.push("", "Published-vs-local drift: skipped (no Supabase env)");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  loadEnv();
  const gaps = collectInternalsGaps();
  let drift = { checked: false, drift: [], error: "" };
  try {
    drift = { ...(await publishedDrift(gaps)), error: "" };
  } catch (err) {
    drift = { checked: false, drift: [], error: err instanceof Error ? err.message : String(err) };
  }
  if (asJson) {
    process.stdout.write(
      `${JSON.stringify({ totals: totals(gaps), ...gaps, issues: internalsGapIssues(gaps), publishedDrift: drift }, null, 2)}\n`,
    );
    return;
  }
  process.stdout.write(textReport(gaps, drift, asMarkdown));
}

main().catch((err) => {
  process.stderr.write(`gaps: ${err.message}\n`);
  process.exitCode = 1;
});
