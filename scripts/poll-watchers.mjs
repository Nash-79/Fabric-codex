#!/usr/bin/env node
// Local watcher poll — the laptop-side fallback for feeds the server cannot reach.
//
// Some publishers (e.g. Khoros-hosted Microsoft community blogs) now serve an anti-bot
// challenge to datacenter egress, so the app's server-side "Poll all" fails while the
// same feed responds normally to this machine. This script polls those watchers from
// here with an honest client identity — no header spoofing, no challenge solving — and
// routes new posts into content/queue.md, the documented offline ingestion queue.
// It never writes to Supabase; git review + /ingest-batch remain the human gate.
//
// Usage:
//   node scripts/poll-watchers.mjs             # poll active watchers the server is failing on
//   node scripts/poll-watchers.mjs --all       # poll every active watcher
//   node scripts/poll-watchers.mjs --dry-run   # report without touching content/queue.md

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const pollAll = args.has("--all");
const dryRun = args.has("--dry-run");
const QUEUE_PATH = "content/queue.md";
const TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const FIRST_POLL_CAP = 25;
const USER_AGENT = "FabricAtlasWatcher/1.0 (local; +https://fabric-atlas.lovable.app/)";
const ASSET_EXT =
  /\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|mp[34]|pdf|png|pptx?|svg|tar|tiff?|ttf|webm|webp|woff2?|xlsx?|zip)$/i;

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
    headers: { apikey: key, authorization: `Bearer ${key}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

function decode(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(block, name) {
  return decode(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "");
}

// Mirrors parseWebFeed in src/lib/source-watcher.server.ts (kept dependency-free here).
function parseWebFeed(body) {
  if (/^\s*\{/.test(body)) {
    try {
      const json = JSON.parse(body);
      if (Array.isArray(json.items))
        return json.items
          .map((x) => ({ url: x.url || x.external_url || x.id, title: x.title || "" }))
          .filter((x) => x.url);
    } catch {
      return [];
    }
    return [];
  }
  return (body.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) ?? [])
    .map((block) => {
      const href = block.match(/<link[^>]*\bhref=["']([^"']+)["']/i)?.[1];
      const url = tag(block, "link") || decode(href ?? "");
      return { url: url || tag(block, "id") || tag(block, "guid"), title: tag(block, "title") };
    })
    .filter((x) => x.url);
}

function canonicalizeUrl(value, base) {
  try {
    const u = new URL(value, base);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$|msclkid$)/i.test(key)) u.searchParams.delete(key);
    u.hostname = u.hostname.toLowerCase();
    if (
      (u.protocol === "https:" && u.port === "443") ||
      (u.protocol === "http:" && u.port === "80")
    )
      u.port = "";
    return u.toString();
  } catch {
    return null;
  }
}

function inScope(value, watcher) {
  const u = new URL(value);
  const host = u.hostname.toLowerCase();
  const alternativeHost = watcher.alternative_url
    ? new URL(watcher.alternative_url).hostname.toLowerCase()
    : null;
  return (
    (host === (watcher.allowed_host || "").toLowerCase() || host === alternativeHost) &&
    (host === alternativeHost || u.pathname.startsWith(watcher.allowed_path_prefix || "/")) &&
    !ASSET_EXT.test(u.pathname) &&
    !/(?:logout|signout|login)(?:\/|$)/i.test(u.pathname)
  );
}

async function fetchFeed(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept:
          "application/rss+xml,application/atom+xml,application/feed+json,application/xml,text/xml;q=0.9,*/*;q=0.1",
        "user-agent": USER_AGENT,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error("Response exceeds the 5 MB limit.");
    const body = new TextDecoder().decode(bytes);
    if (/cf-browser-verification|challenge-platform|Just a moment/i.test(body))
      throw new Error("Anti-bot challenge served to this machine too; not bypassing it.");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

async function knownUrls(base, key, watcherIds) {
  const known = new Set();
  const soak = (rows, field) => {
    for (const row of rows) if (row[field]) known.add(row[field]);
  };
  const attempts = [
    ["sources?select=url&limit=10000", "url"],
    ["queue_public?select=url,status&status=in.(queued,claimed)&limit=10000", "url"],
  ];
  for (const id of watcherIds)
    attempts.push([
      `source_watcher_items?select=canonical_url&watcher_id=eq.${id}&limit=10000`,
      "canonical_url",
    ]);
  for (const [path, field] of attempts) {
    try {
      soak(await rest(base, key, path), field);
    } catch {
      // View or policy not deployed yet — dedupe still covers content/queue.md below.
    }
  }
  return known;
}

async function main() {
  loadEnv();
  const base = envValue("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = envValue("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!base || !key) {
    console.log("Missing SUPABASE_URL/VITE_SUPABASE_URL or publishable key; nothing polled.");
    return;
  }
  let watchers;
  try {
    watchers = await rest(base, key, "source_watcher_status_public?select=*&status=eq.active");
  } catch (err) {
    console.log(`Could not read watchers: ${err.message}`);
    return;
  }
  if (!watchers.length) {
    console.log(
      "No active watchers visible. If watchers exist in the UI, apply the " +
        "20260711150000_watcher_public_read_local_poll migration (supabase db push).",
    );
    return;
  }
  const targets = pollAll ? watchers : watchers.filter((w) => (w.error_count ?? 0) > 0);
  if (!targets.length) {
    console.log(`All ${watchers.length} active watcher(s) are healthy server-side; nothing to do.`);
    return;
  }

  const queueText = existsSync(QUEUE_PATH) ? readFileSync(QUEUE_PATH, "utf8") : "";
  const known = await knownUrls(
    base,
    key,
    targets.map((w) => w.id),
  );
  const additions = [];

  for (const watcher of targets) {
    const label = watcher.title || watcher.url;
    const feedUrl = watcher.alternative_url || watcher.url;
    let body;
    try {
      body = await fetchFeed(feedUrl);
    } catch (err) {
      console.log(`✗ ${label}: ${err.message}`);
      continue;
    }
    const items = parseWebFeed(body);
    if (!items.length) {
      console.log(
        `✗ ${label}: no feed items found (local poller handles RSS/Atom/JSON feeds only).`,
      );
      continue;
    }
    let candidates = items
      .map((x) => ({ ...x, url: canonicalizeUrl(x.url, feedUrl) }))
      .filter((x) => x.url && inScope(x.url, watcher));
    const cap = watcher.last_success_at ? watcher.max_pages || 100 : FIRST_POLL_CAP;
    const capped = candidates.length > cap;
    if (capped) candidates = candidates.slice(0, cap);
    const fresh = candidates.filter((x) => !known.has(x.url) && !queueText.includes(x.url));
    for (const item of fresh) {
      known.add(item.url);
      additions.push({ watcher: label, tier: watcher.default_tier ?? 6, ...item });
    }
    console.log(
      `✓ ${label}: ${items.length} item(s), ${candidates.length} in scope` +
        `${capped ? ` (capped at ${cap})` : ""}, ${fresh.length} new`,
    );
  }

  if (!additions.length) {
    console.log("No new posts to queue.");
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const lines = [
    `# ---- Local watcher poll (${stamp}) — review, then run /ingest-batch ----`,
    ...additions.map(
      (a) => `${a.url} tier=${a.tier} # via watcher: ${a.watcher}${a.title ? ` — ${a.title}` : ""}`,
    ),
  ];
  if (dryRun) {
    console.log(`\n--dry-run: would append to ${QUEUE_PATH}:\n${lines.join("\n")}`);
    return;
  }
  const eol = queueText.includes("\r\n") ? "\r\n" : "\n";
  const block = lines.join(eol) + eol + eol;
  const doneAt = queueText.search(/^## Done/m);
  const updated =
    doneAt >= 0
      ? queueText.slice(0, doneAt) + block + queueText.slice(doneAt)
      : queueText.trimEnd() + eol + eol + block;
  writeFileSync(QUEUE_PATH, updated);
  console.log(
    `\nAppended ${additions.length} new post(s) to ${QUEUE_PATH}. Review the git diff, then run /ingest-batch.`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
