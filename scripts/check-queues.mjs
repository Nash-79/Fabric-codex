#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const brief = args.has("--brief");
const asJson = args.has("--json");
const defaultPlanPath =
  process.env.FABRIC_ATLAS_PLAN_PATH ??
  "C:\\Users\\nmepa\\.claude\\plans\\review-app-how-much-purrfect-nest.md";

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

function olderThanDay(value) {
  if (!value) return true;
  return Date.now() - new Date(value).getTime() > 24 * 60 * 60 * 1000;
}

function due(item) {
  return !item.scheduled_at || new Date(item.scheduled_at).getTime() <= Date.now();
}

function commandFor(item) {
  if (item.kind === "diagram") return `/diagram ${item.target_slug ?? item.title ?? ""}`.trim();
  if (item.kind === "article") return `/blog ${item.target_slug ?? item.title ?? ""}`.trim();
  if (item.kind === "design") return `/design ${item.target_slug ?? item.title ?? ""}`.trim();
  if (item.kind === "lesson") return `/lesson ${item.target_slug ?? item.title ?? ""}`.trim();
  return "/ingest-batch";
}

function textReport(digest) {
  const lines = [];
  lines.push("Fabric Atlas queue digest");
  if (digest.plan.exists) {
    lines.push(`Plan: ${digest.plan.path}`);
  } else if (!brief) {
    lines.push(`Plan file not found; continuing without it: ${digest.plan.path}`);
  }
  if (digest.error) {
    lines.push(`Supabase queue check skipped: ${digest.error}`);
    return `${lines.join("\n")}\n`;
  }
  lines.push(
    `Queue: ${digest.queue.openSources} source(s), ${digest.queue.dueCommissions} due commission(s), ${digest.queue.failed} failed`,
  );
  lines.push(
    `RSS: ${digest.rss.active} active, ${digest.rss.stale} stale, ${digest.rss.failing} failing`,
  );
  lines.push(
    `Coverage: ${digest.coverage.articleLessTopics} article-less topic(s), ${digest.coverage.diagramGaps} diagram gap(s), ${digest.claims.pending} pending claim(s)`,
  );
  if (digest.next.length) {
    lines.push("Next actions:");
    for (const action of digest.next.slice(0, brief ? 4 : 8)) {
      lines.push(`- ${action}`);
    }
  } else {
    lines.push("Next actions: none");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  loadEnv();
  const url = envValue("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = envValue("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");
  const planPath = resolve(defaultPlanPath);
  const digest = {
    plan: { path: planPath, exists: existsSync(planPath) },
    queue: { openSources: 0, dueCommissions: 0, failed: 0 },
    rss: { active: 0, stale: 0, failing: 0 },
    coverage: { articleLessTopics: 0, diagramGaps: 0, storageOverrides: 0 },
    claims: { pending: 0 },
    next: [],
    error: "",
  };

  if (!url || !key) {
    digest.error = "missing SUPABASE_URL/VITE_SUPABASE_URL or publishable key";
    process.stdout.write(asJson ? `${JSON.stringify(digest, null, 2)}\n` : textReport(digest));
    return;
  }

  try {
    const [queue, rss, topics, items, diagrams, claims] = await Promise.all([
      rest(url, key, "queue_public?select=*&order=created_at.desc"),
      rest(url, key, "rss_status_public?select=*"),
      rest(url, key, "topics?select=slug,name,active&active=eq.true"),
      rest(
        url,
        key,
        "content_items?select=kind,slug,topic_slug,body_md,active,status&active=eq.true&status=eq.published",
      ),
      rest(url, key, "diagrams?select=slug,topic_slug,path,capability_id"),
      rest(url, key, "claims?select=id,status,active&status=eq.pending&active=eq.true"),
    ]);

    const openSources = queue.filter(
      (q) => q.kind === "source" && ["queued", "claimed"].includes(q.status),
    );
    const failed = queue.filter((q) => q.status === "failed");
    const commissions = queue.filter(
      (q) => q.kind !== "source" && ["queued", "claimed"].includes(q.status) && due(q),
    );
    const articleTopics = new Set(
      items.filter((i) => i.kind === "article" && i.topic_slug).map((i) => i.topic_slug),
    );
    const diagramTopics = new Set(diagrams.filter((d) => d.topic_slug).map((d) => d.topic_slug));
    const topicSlugs = topics.map((t) => t.slug);
    const articleLess = topicSlugs.filter((slug) => !articleTopics.has(slug));
    const diagramGaps = topicSlugs.filter((slug) => !diagramTopics.has(slug));
    const storageOverrides = diagrams.filter((d) => /^https?:\/\//i.test(d.path ?? ""));
    const staleFeeds = rss.filter((r) => r.status === "active" && olderThanDay(r.last_polled_at));
    const failingFeeds = rss.filter((r) => (r.error_count ?? 0) > 0);

    digest.queue = {
      openSources: openSources.length,
      dueCommissions: commissions.length,
      failed: failed.length,
    };
    digest.rss = {
      active: rss.filter((r) => r.status === "active").length,
      stale: staleFeeds.length,
      failing: failingFeeds.length,
    };
    digest.coverage = {
      articleLessTopics: articleLess.length,
      diagramGaps: diagramGaps.length,
      storageOverrides: storageOverrides.length,
    };
    digest.claims.pending = claims.length;

    for (const item of openSources.slice(0, 3))
      digest.next.push(`/ingest-batch # ${item.title || item.url}`);
    for (const item of commissions.slice(0, 3)) digest.next.push(commandFor(item));
    if (staleFeeds.length || failingFeeds.length) digest.next.push("/poll-rss-feeds");
    for (const slug of articleLess.slice(0, 2)) digest.next.push(`/blog ${slug}`);
    for (const slug of diagramGaps.slice(0, 2)) digest.next.push(`/commission-diagrams ${slug}`);
    if (claims.length) digest.next.push("/orchestrate-content");
    if (storageOverrides.length)
      digest.next.push("Backport storage-overridden diagrams to content/diagrams/");
  } catch (err) {
    digest.error = err instanceof Error ? err.message : String(err);
  }

  process.stdout.write(asJson ? `${JSON.stringify(digest, null, 2)}\n` : textReport(digest));
}

main().catch((err) => {
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: err.message }, null, 2)}\n`);
  }
  process.exitCode = 0;
});
