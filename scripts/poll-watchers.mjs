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
// Requires Node >= 22.18 — it imports src/lib/feed-parse.ts directly, relying on
// Node's native TypeScript type stripping, so there is one feed parser, not two.
//
// Usage:
//   node scripts/poll-watchers.mjs             # poll active watchers the server is failing on
//   node scripts/poll-watchers.mjs --all       # poll every active watcher
//   node scripts/poll-watchers.mjs --dry-run   # report without touching content/queue.md

import { existsSync, readFileSync, writeFileSync } from "node:fs";
// Imported directly from the TypeScript source via Node's native type stripping
// (unflagged since Node 22.18) so this script shares one parser with the app
// rather than keeping a second copy. Requires Node >= 22.18.
import { parseWebFeed } from "../src/lib/feed-parse.ts";

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

async function agentSnapshot(appUrl, token) {
  if (!appUrl || !token)
    throw new Error(
      "Missing FABRIC_ATLAS_APP_URL or FABRIC_ATLAS_AGENT_READ_TOKEN; private watcher state cannot be read safely.",
    );
  const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/public/hooks/poll-feeds`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Agent snapshot returned HTTP ${res.status}.`);
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

function parseSitemap(body) {
  const urls = [...body.matchAll(/<url\b[\s\S]*?<loc>([\s\S]*?)<\/loc>[\s\S]*?<\/url>/gi)].map(
    (m) => ({ url: decode(m[1]), title: "" }),
  );
  const sitemaps = [
    ...body.matchAll(/<sitemap\b[\s\S]*?<loc>([\s\S]*?)<\/loc>[\s\S]*?<\/sitemap>/gi),
  ].map((m) => decode(m[1]));
  return { urls, sitemaps };
}

function feedLinks(body, base) {
  return [
    ...body.matchAll(
      /<link\b[^>]*\brel=["'][^"']*alternate[^"']*["'][^>]*\b(?:type=["'](?:application\/(?:rss|atom)\+xml|application\/feed\+json)["'])[^>]*>/gi,
    ),
  ]
    .map((m) => m[0].match(/\bhref=["']([^"']+)["']/i)?.[1])
    .filter(Boolean)
    .map((url) => canonicalizeUrl(url, base))
    .filter(Boolean);
}

function listingLinks(body, base, watcher) {
  const seen = new Set();
  return [...body.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({
      url: canonicalizeUrl(m[1], base),
      title: decode(m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")),
    }))
    .filter(
      (item) => item.url && inScope(item.url, watcher) && !seen.has(item.url) && seen.add(item.url),
    );
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

async function discoverLocal(watcher) {
  const attempts = [];
  const fetched = new Map();
  const tried = new Set();
  const root = watcher.url;
  const seeds = [...new Set([watcher.alternative_url, root].filter(Boolean))];
  const get = async (url) => {
    const resolved = canonicalizeUrl(url, root);
    if (!fetched.has(resolved)) fetched.set(resolved, await fetchFeed(resolved));
    return { url: resolved, body: fetched.get(resolved) };
  };
  const attempt = async (mode, url) => {
    const resolvedUrl = canonicalizeUrl(url, root);
    const key = `${mode}:${resolvedUrl}`;
    if (!resolvedUrl || tried.has(key)) return null;
    tried.add(key);
    try {
      const page = await get(resolvedUrl);
      let candidates = [];
      if (mode === "rss") candidates = parseWebFeed(page.body);
      else if (mode === "sitemap") {
        const parsed = parseSitemap(page.body);
        candidates.push(...parsed.urls);
        for (const childUrl of parsed.sitemaps.slice(
          0,
          Math.max(0, (watcher.max_pages || 100) - 1),
        )) {
          try {
            candidates.push(...parseSitemap((await get(childUrl)).body).urls);
          } catch {
            // Continue through remaining sitemap children and fallback strategies.
          }
        }
      } else if (mode === "listing") candidates = listingLinks(page.body, page.url, watcher);
      else candidates = [{ url: page.url, title: watcher.title || "" }];
      candidates = candidates
        .map((item) => ({ ...item, url: canonicalizeUrl(item.url, page.url) }))
        .filter((item) => item.url && inScope(item.url, watcher));
      attempts.push({ mode, url: resolvedUrl, candidates: candidates.length });
      return candidates.length ? { mode, resolvedUrl, candidates, attempts } : null;
    } catch (err) {
      attempts.push({ mode, url: resolvedUrl, candidates: 0, error: err.message });
      return null;
    }
  };
  if (watcher.detected_mode && watcher.detected_url) {
    const retained = await attempt(watcher.detected_mode, watcher.detected_url);
    if (retained) return retained;
  }
  for (const seed of seeds) {
    const direct = await attempt("rss", seed);
    if (direct) return direct;
  }
  for (const seed of seeds) {
    try {
      const page = await get(seed);
      for (const link of feedLinks(page.body, page.url)) {
        const result = await attempt("rss", link);
        if (result) return result;
      }
    } catch {
      // Other candidates can still succeed.
    }
  }
  const origins = [...new Set(seeds.map((seed) => new URL(seed).origin))];
  for (const feed of origins.flatMap((origin) =>
    ["/feed", "/feed/", "/rss", "/rss.xml", "/atom.xml", "/feed.xml"].map(
      (path) => `${origin}${path}`,
    ),
  )) {
    const result = await attempt("rss", feed);
    if (result) return result;
  }
  for (const map of [...seeds, ...origins.map((origin) => `${origin}/sitemap.xml`)]) {
    const result = await attempt("sitemap", map);
    if (result) return result;
  }
  for (const seed of seeds) {
    const result = await attempt("listing", seed);
    if (result) return result;
  }
  for (const seed of seeds) {
    const result = await attempt("page", seed);
    if (result) return result;
  }
  throw new Error(`No watcher strategy returned output (${attempts.length} attempts).`);
}

async function knownUrls(base, key, watcherIds, watcherItems, queueItems) {
  const known = new Set();
  const soak = (rows, field) => {
    for (const row of rows) if (row[field]) known.add(row[field]);
  };
  const attempts = [["sources?select=url&limit=10000", "url"]];
  soak(
    queueItems.filter((item) => ["queued", "claimed"].includes(item.status)),
    "url",
  );
  const wanted = new Set(watcherIds);
  soak(
    watcherItems.filter((item) => wanted.has(item.watcher_id)),
    "canonical_url",
  );
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
  const appUrl = envValue("FABRIC_ATLAS_APP_URL");
  const agentToken = envValue("FABRIC_ATLAS_AGENT_READ_TOKEN");
  if (!base || !key) {
    console.log("Missing SUPABASE_URL/VITE_SUPABASE_URL or publishable key; nothing polled.");
    return;
  }
  let snapshot;
  try {
    snapshot = await agentSnapshot(appUrl, agentToken);
  } catch (err) {
    console.log(`Could not read private watcher state: ${err.message}`);
    return;
  }
  const watchers = (snapshot.watchers ?? []).filter((watcher) => watcher.status === "active");
  if (!watchers.length) {
    console.log("No active watchers are configured.");
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
    snapshot.watcher_items ?? [],
    snapshot.queue ?? [],
  );
  const additions = [];

  for (const watcher of targets) {
    const label = watcher.title || watcher.url;
    let discovered;
    try {
      discovered = await discoverLocal(watcher);
    } catch (err) {
      console.log(`✗ ${label}: ${err.message}`);
      continue;
    }
    const items = discovered.candidates;
    let candidates = items;
    const cap = watcher.last_success_at ? watcher.max_pages || 100 : FIRST_POLL_CAP;
    const capped = candidates.length > cap;
    if (capped) candidates = candidates.slice(0, cap);
    const fresh = candidates.filter((x) => !known.has(x.url) && !queueText.includes(x.url));
    for (const item of fresh) {
      known.add(item.url);
      additions.push({ watcher: label, tier: watcher.default_tier ?? 6, ...item });
    }
    console.log(
      `✓ ${label}: ${discovered.mode} via ${discovered.resolvedUrl}; ${items.length} item(s), ${candidates.length} in scope` +
        `${capped ? ` (capped at ${cap})` : ""}, ${fresh.length} new`,
    );
    if (
      watcher.detected_mode !== discovered.mode ||
      watcher.detected_url !== discovered.resolvedUrl
    )
      console.log(
        `  retained mapping changed locally to ${discovered.mode} ${discovered.resolvedUrl}; an authenticated server poll will persist it.`,
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
