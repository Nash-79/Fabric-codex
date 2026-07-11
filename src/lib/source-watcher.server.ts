import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type SupabaseAdmin = any;
export type WatcherMode = "auto" | "rss" | "sitemap" | "listing" | "page";
export type WatcherErrorCode =
  "blocked" | "http" | "timeout" | "robots_denied" | "invalid_content" | "parse_failure";

type Candidate = {
  url: string;
  title: string;
  stableId?: string;
  modified?: string;
  fingerprint?: string;
};
type Watcher = {
  id: string;
  url: string;
  alternative_url?: string | null;
  title: string;
  mode: WatcherMode;
  allowed_host: string;
  allowed_path_prefix: string;
  max_depth: number;
  max_pages: number;
  default_tier: number;
  default_tags: string[];
  last_success_at?: string | null;
  etag?: string | null;
  last_modified?: string | null;
};

export type WatcherResult = {
  watcher: string;
  mode: WatcherMode | null;
  fetched: number;
  discovered: number;
  changed: number;
  queued: number;
  skipped: number;
  capped: boolean;
  error: { code: WatcherErrorCode; message: string } | null;
};

export const FIRST_POLL_CAP = 25;
const TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const ASSET_EXT =
  /\.(?:avif|bmp|css|csv|docx?|eot|gif|ico|jpe?g|js|json|mp[34]|pdf|png|pptx?|svg|tar|tiff?|ttf|webm|webp|woff2?|xlsx?|zip)$/i;

class WatcherFailure extends Error {
  constructor(
    public code: WatcherErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function privateIp(address: string): boolean {
  if (
    address === "::1" ||
    address === "::" ||
    address.startsWith("fe80:") ||
    address.startsWith("fc") ||
    address.startsWith("fd")
  )
    return true;
  const p = address.split(".").map(Number);
  return (
    p.length === 4 &&
    (p[0] === 10 ||
      p[0] === 127 ||
      p[0] === 0 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168))
  );
}

export async function assertSafeUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WatcherFailure("invalid_content", "Invalid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new WatcherFailure("invalid_content", "Only credential-free HTTP(S) URLs are supported.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local"))
    throw new WatcherFailure("invalid_content", "Local network destinations are not allowed.");
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw new WatcherFailure("http", "Host could not be resolved.");
  if (addresses.some((a) => privateIp(a.address)))
    throw new WatcherFailure("invalid_content", "Private network destinations are not allowed.");
  return url;
}

export function canonicalizeUrl(value: string, base?: string): string | null {
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

function inScope(value: string, watcher: Watcher): boolean {
  const u = new URL(value);
  const alternativeHost = watcher.alternative_url
    ? new URL(watcher.alternative_url).hostname.toLowerCase()
    : null;
  return (
    (u.hostname.toLowerCase() === watcher.allowed_host.toLowerCase() ||
      u.hostname.toLowerCase() === alternativeHost) &&
    (u.hostname.toLowerCase() === alternativeHost ||
      u.pathname.startsWith(watcher.allowed_path_prefix || "/")) &&
    !ASSET_EXT.test(u.pathname) &&
    !/(?:logout|signout|login)(?:\/|$)/i.test(u.pathname)
  );
}

function challenge(text: string): boolean {
  return /Just a moment|cf-browser-verification|challenge-platform|Attention Required! \| Cloudflare/i.test(
    text,
  );
}
function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}
function tag(block: string, name: string): string {
  return decode(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "");
}

export function parseWebFeed(body: string): Candidate[] {
  if (/^\s*\{/.test(body)) {
    try {
      const json = JSON.parse(body);
      if (Array.isArray(json.items))
        return json.items
          .map((x: any) => ({
            url: x.url || x.external_url || x.id,
            stableId: x.id,
            title: x.title || "",
            modified: x.date_modified || x.date_published,
          }))
          .filter((x: Candidate) => x.url);
    } catch {
      return [];
    }
  }
  return (body.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) ?? [])
    .map((block) => {
      const href = block.match(/<link[^>]*\bhref=["']([^"']+)["']/i)?.[1];
      const url = tag(block, "link") || decode(href ?? "");
      return {
        url: url || tag(block, "id") || tag(block, "guid"),
        stableId: tag(block, "guid") || tag(block, "id") || url,
        title: tag(block, "title"),
        modified: tag(block, "updated") || tag(block, "published") || tag(block, "pubDate"),
      };
    })
    .filter((x) => x.url);
}

export function parseSitemap(body: string): { urls: Candidate[]; sitemaps: string[] } {
  const blocks = body.match(/<url\b[\s\S]*?<\/url>/gi) ?? [];
  const urls = blocks
    .map((b) => ({ url: tag(b, "loc"), title: "", modified: tag(b, "lastmod") }))
    .filter((x) => x.url);
  const sitemaps = (body.match(/<sitemap\b[\s\S]*?<\/sitemap>/gi) ?? [])
    .map((b) => tag(b, "loc"))
    .filter(Boolean);
  return { urls, sitemaps };
}

export function normalizeHtml(body: string): string {
  return body
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/<(script|style|nav|footer|header|noscript)\b[^]*?<\/\1>/gi, " ")
    .replace(/\s(?:data-[\w-]+|aria-[\w-]+|class|id|style)=(?:"[^"]*"|'[^']*')/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[\d.:+-]+Z?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function htmlLinks(body: string, base: string, watcher: Watcher): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const m of body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = canonicalizeUrl(decode(m[1]), base);
    if (url && inScope(url, watcher))
      out.set(url, { url, title: normalizeHtml(m[2]).slice(0, 300) });
  }
  return [...out.values()];
}
function feedLinks(body: string, base: string): string[] {
  return [
    ...body.matchAll(
      /<link\b[^>]*(?:type=["']application\/(?:rss\+xml|atom\+xml|feed\+json)["']|rel=["']alternate["'])[^>]*>/gi,
    ),
  ]
    .map((m) => m[0].match(/href=["']([^"']+)["']/i)?.[1])
    .filter(Boolean)
    .map((x) => canonicalizeUrl(x!, base))
    .filter(Boolean) as string[];
}

async function fingerprintPages(
  candidates: Candidate[],
  watcher: Watcher,
  alreadyFetched: number,
): Promise<{ candidates: Candidate[]; fetched: number }> {
  const out: Candidate[] = [];
  let fetched = alreadyFetched;
  for (const candidate of candidates) {
    if (fetched >= watcher.max_pages) break;
    const url = canonicalizeUrl(candidate.url, watcher.url);
    if (!url || !inScope(url, watcher)) continue;
    try {
      const page = await fetchText(url);
      fetched++;
      const type = page.headers.get("content-type") || "";
      if (!/html|text\//i.test(type) && !/<html|<!doctype/i.test(page.body)) continue;
      const title = normalizeHtml(
        page.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || candidate.title,
      ).slice(0, 300);
      out.push({ ...candidate, url, title, fingerprint: hash(normalizeHtml(page.body)) });
    } catch {
      out.push({ ...candidate, url });
    }
  }
  return { candidates: out, fetched };
}

async function fetchText(
  value: string,
  headers: Record<string, string> = {},
): Promise<{ url: string; body: string; headers: Headers; status: number }> {
  let current = (await assertSafeUrl(value)).toString();
  for (let redirects = 0; redirects <= 5; redirects++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept:
            "application/rss+xml,application/atom+xml,application/feed+json,application/xml,text/xml,text/html;q=0.9,*/*;q=0.1",
          "user-agent": "FabricAtlasWatcher/1.0 (+https://fabric-atlas.lovable.app/)",
          ...headers,
        },
      });
    } catch (e) {
      throw new WatcherFailure(
        (e as Error).name === "AbortError" ? "timeout" : "http",
        (e as Error).name === "AbortError" ? "Request timed out." : "Network request failed.",
      );
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = (
        await assertSafeUrl(new URL(res.headers.get("location")!, current).toString())
      ).toString();
      continue;
    }
    if (res.status === 304) return { url: current, body: "", headers: res.headers, status: 304 };
    const length = Number(res.headers.get("content-length") || 0);
    if (length > MAX_RESPONSE_BYTES)
      throw new WatcherFailure("invalid_content", "Response exceeds the 5 MB limit.");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES)
      throw new WatcherFailure("invalid_content", "Response exceeds the 5 MB limit.");
    const body = new TextDecoder().decode(bytes);
    if (challenge(body))
      throw new WatcherFailure(
        "blocked",
        "The site returned an anti-bot challenge; configure a first-party feed, sitemap, or alternative URL.",
      );
    if (!res.ok)
      throw new WatcherFailure(
        res.status === 401 || res.status === 403 || res.status === 429 ? "blocked" : "http",
        `HTTP ${res.status} ${res.statusText}`.trim(),
      );
    return { url: current, body, headers: res.headers, status: res.status };
  }
  throw new WatcherFailure("http", "Too many redirects.");
}

async function robotsFor(watcher: Watcher): Promise<{ allowed: boolean; sitemaps: string[] }> {
  const origin = new URL(watcher.url).origin;
  try {
    const { body } = await fetchText(`${origin}/robots.txt`);
    const sitemaps = [...body.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    const groups = body
      .split(/^\s*User-agent:/gim)
      .slice(1)
      .map((g) => ({ agent: g.split(/\r?\n/, 1)[0].trim(), rules: g }));
    const group = groups.find((g) => g.agent === "*");
    const disallowed = group
      ? [...group.rules.matchAll(/^\s*Disallow:\s*(\S*)/gim)].map((m) => m[1]).filter(Boolean)
      : [];
    return {
      allowed: !disallowed.some((p) => new URL(watcher.url).pathname.startsWith(p)),
      sitemaps,
    };
  } catch {
    return { allowed: true, sitemaps: [] };
  }
}

async function discover(watcher: Watcher): Promise<{
  mode: WatcherMode;
  candidates: Candidate[];
  fetched: number;
  etag?: string;
  lastModified?: string;
}> {
  const robots = await robotsFor(watcher);
  if (!robots.allowed)
    throw new WatcherFailure("robots_denied", "robots.txt disallows this watcher path.");
  const start = watcher.alternative_url || watcher.url;
  const conditional: Record<string, string> = {};
  if (watcher.etag) conditional["if-none-match"] = watcher.etag;
  if (watcher.last_modified) conditional["if-modified-since"] = watcher.last_modified;
  let first;
  try {
    first = await fetchText(start, conditional);
  } catch (error) {
    if (error instanceof WatcherFailure && error.code === "blocked") {
      const origin = new URL(start).origin;
      const feedPaths = ["/feed", "/feed/", "/rss", "/rss.xml", "/atom.xml", "/feed.xml"];
      for (const feed of feedPaths.map((p) => `${origin}${p}`)) {
        try {
          const r = await fetchText(feed);
          const items = parseWebFeed(r.body);
          if (items.length) return { mode: "rss", candidates: items, fetched: 1 };
        } catch {
          // Try the next first-party feed before falling back to sitemaps.
        }
      }
      for (const map of [...robots.sitemaps, `${origin}/sitemap.xml`]) {
        try {
          const sitemap = await fetchText(map);
          const parsed = parseSitemap(sitemap.body);
          if (parsed.urls.length) {
            const scoped = parsed.urls.filter(
              (item) => canonicalizeUrl(item.url) && inScope(canonicalizeUrl(item.url)!, watcher),
            );
            const hydrated = await fingerprintPages(scoped, watcher, 1);
            return {
              mode: "sitemap",
              candidates: hydrated.candidates,
              fetched: hydrated.fetched,
            };
          }
        } catch {
          // Try the next first-party sitemap before reporting the original challenge.
        }
      }
    }
    throw error;
  }
  if (first.status === 304)
    return { mode: watcher.mode === "auto" ? "page" : watcher.mode, candidates: [], fetched: 1 };
  const meta = {
    etag: first.headers.get("etag") || undefined,
    lastModified: first.headers.get("last-modified") || undefined,
  };
  const directFeed = parseWebFeed(first.body);
  if ((watcher.mode === "rss" || watcher.mode === "auto") && directFeed.length)
    return { mode: "rss", candidates: directFeed, fetched: 1, ...meta };
  if (watcher.mode === "auto")
    for (const feed of feedLinks(first.body, first.url)) {
      const f = await fetchText(feed);
      const items = parseWebFeed(f.body);
      if (items.length) return { mode: "rss", candidates: items, fetched: 2, ...meta };
    }
  const directMap = parseSitemap(first.body);
  if (
    (watcher.mode === "sitemap" || watcher.mode === "auto") &&
    (directMap.urls.length || directMap.sitemaps.length)
  ) {
    const urls = [...directMap.urls];
    let fetched = 1;
    for (const map of directMap.sitemaps.slice(0, watcher.max_pages - 1)) {
      const child = await fetchText(map);
      fetched++;
      urls.push(...parseSitemap(child.body).urls);
    }
    const scoped = urls.filter(
      (x) => canonicalizeUrl(x.url) && inScope(canonicalizeUrl(x.url)!, watcher),
    );
    const hydrated = await fingerprintPages(scoped, watcher, fetched);
    return { mode: "sitemap", candidates: hydrated.candidates, fetched: hydrated.fetched, ...meta };
  }
  if (watcher.mode === "auto")
    for (const map of [...robots.sitemaps, `${new URL(start).origin}/sitemap.xml`]) {
      try {
        const s = await fetchText(map);
        const parsed = parseSitemap(s.body);
        if (parsed.urls.length) {
          const scoped = parsed.urls.filter(
            (x) => canonicalizeUrl(x.url) && inScope(canonicalizeUrl(x.url)!, watcher),
          );
          const hydrated = await fingerprintPages(scoped, watcher, 2);
          return {
            mode: "sitemap",
            candidates: hydrated.candidates,
            fetched: hydrated.fetched,
            ...meta,
          };
        }
      } catch {
        /* fall through to listing */
      }
    }
  if (watcher.mode === "listing" || watcher.mode === "auto") {
    const links = htmlLinks(first.body, first.url, watcher);
    if (links.length) {
      const hydrated =
        watcher.max_depth > 0
          ? await fingerprintPages(links, watcher, 1)
          : { candidates: links, fetched: 1 };
      return {
        mode: "listing",
        candidates: hydrated.candidates,
        fetched: hydrated.fetched,
        ...meta,
      };
    }
  }
  if (watcher.mode === "page" || watcher.mode === "auto")
    return {
      mode: "page",
      candidates: [
        {
          url: canonicalizeUrl(first.url)!,
          title: watcher.title,
          fingerprint: hash(normalizeHtml(first.body)),
        },
      ],
      fetched: 1,
      ...meta,
    };
  throw new WatcherFailure("parse_failure", `The response was not valid ${watcher.mode} content.`);
}

async function enqueueCandidate(
  sb: SupabaseAdmin,
  watcher: Watcher,
  candidate: Candidate,
  mode: WatcherMode,
  actorId: string | null,
  firstPoll: boolean,
): Promise<"queued" | "changed" | "skipped"> {
  const url = canonicalizeUrl(candidate.url, watcher.url);
  if (!url || !inScope(url, watcher)) return "skipped";
  const fingerprint =
    candidate.fingerprint ||
    hash([candidate.stableId || url, candidate.modified || "", candidate.title || ""].join("\n"));
  const { data: state } = await sb
    .from("source_watcher_items")
    .select("id,content_fingerprint,last_queued_fingerprint")
    .eq("watcher_id", watcher.id)
    .eq("canonical_url", url)
    .maybeSingle();
  const changed = !!state && state.content_fingerprint !== fingerprint;
  const { data: source } = await sb.from("sources").select("id").eq("url", url).maybeSingle();
  const { data: open } = await sb
    .from("queue_items")
    .select("id")
    .eq("url", url)
    .in("status", ["queued", "claimed"])
    .maybeSingle();
  let queued = false;
  if (
    (!state && !source && !open) ||
    (changed && source && !open && state.last_queued_fingerprint !== fingerprint)
  ) {
    const notes = changed
      ? `Website change review via ${mode}: ${watcher.title || watcher.url}`
      : `Discovered via ${mode}: ${watcher.title || watcher.url}`;
    const { error } = await sb.from("queue_items").insert({
      url,
      title: candidate.title || "",
      tier: watcher.default_tier,
      tags: watcher.default_tags || [],
      kind: "source",
      notes,
      submitted_by: actorId,
      status: "queued",
    });
    if (!error) queued = true;
    else if (error.code !== "23505") throw new Error(error.message);
  }
  const row = {
    watcher_id: watcher.id,
    canonical_url: url,
    stable_id: candidate.stableId || null,
    title: candidate.title || "",
    content_fingerprint: fingerprint,
    last_queued_fingerprint: queued ? fingerprint : state?.last_queued_fingerprint || null,
    source_modified_at:
      candidate.modified && !Number.isNaN(Date.parse(candidate.modified))
        ? new Date(candidate.modified).toISOString()
        : null,
    last_seen_at: new Date().toISOString(),
  };
  await sb.from("source_watcher_items").upsert(row, { onConflict: "watcher_id,canonical_url" });
  return queued ? (changed ? "changed" : "queued") : "skipped";
}

export async function testWatcher(
  input: Omit<Watcher, "id" | "default_tier" | "default_tags">,
): Promise<{ mode: WatcherMode; fetched: number; discovered: number; sample: Candidate[] }> {
  const result = await discover({ ...input, id: "test", default_tier: 6, default_tags: [] });
  return {
    mode: result.mode,
    fetched: result.fetched,
    discovered: result.candidates.length,
    sample: result.candidates.slice(0, 10),
  };
}

export async function pollSourceWatchersCore(
  sb: SupabaseAdmin,
  opts: { watcherId?: string; actorId?: string | null } = {},
) {
  let query = sb.from("source_watchers").select("*").eq("status", "active").order("created_at");
  if (opts.watcherId) query = query.eq("id", opts.watcherId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const results: WatcherResult[] = [];
  for (const watcher of (data ?? []) as Watcher[]) {
    const now = new Date().toISOString();
    try {
      const found = await discover(watcher);
      const firstPoll = !watcher.last_success_at;
      let candidates = found.candidates;
      let capped = false;
      const cap = firstPoll ? Math.min(FIRST_POLL_CAP, watcher.max_pages) : watcher.max_pages;
      if (candidates.length > cap) {
        candidates = candidates.slice(-cap);
        capped = true;
      }
      let queued = 0,
        changed = 0,
        skipped = 0;
      for (const c of candidates) {
        const outcome = await enqueueCandidate(
          sb,
          watcher,
          c,
          found.mode,
          opts.actorId ?? null,
          firstPoll,
        );
        if (outcome === "queued") queued++;
        else if (outcome === "changed") {
          queued++;
          changed++;
        } else skipped++;
      }
      await sb
        .from("source_watchers")
        .update({
          detected_mode: found.mode,
          last_attempt_at: now,
          last_success_at: now,
          error_count: 0,
          last_error_code: null,
          last_error: "",
          etag: found.etag,
          last_modified: found.lastModified,
        })
        .eq("id", watcher.id);
      results.push({
        watcher: watcher.title || watcher.url,
        mode: found.mode,
        fetched: found.fetched,
        discovered: found.candidates.length,
        changed,
        queued,
        skipped,
        capped,
        error: null,
      });
    } catch (e) {
      const failure =
        e instanceof WatcherFailure ? e : new WatcherFailure("http", (e as Error).message);
      const count = ((watcher as any).error_count ?? 0) + 1;
      await sb
        .from("source_watchers")
        .update({
          last_attempt_at: now,
          error_count: count,
          last_error_code: failure.code,
          last_error: failure.message.slice(0, 300),
        })
        .eq("id", watcher.id);
      results.push({
        watcher: watcher.title || watcher.url,
        mode: null,
        fetched: 0,
        discovered: 0,
        changed: 0,
        queued: 0,
        skipped: 0,
        capped: false,
        error: { code: failure.code, message: failure.message },
      });
    }
  }
  return { ok: true as const, results, totalQueued: results.reduce((n, x) => n + x.queued, 0) };
}
