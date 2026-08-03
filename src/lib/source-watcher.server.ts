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
  detected_mode?: WatcherMode | null;
  detected_url?: string | null;
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
  resolvedUrl: string | null;
  retainedChanged: boolean;
  attempts: WatcherAttempt[];
  fetched: number;
  discovered: number;
  changed: number;
  queued: number;
  skipped: number;
  capped: boolean;
  error: {
    code: WatcherErrorCode;
    message: string;
    trigger?: string;
    suggestedUrl?: string;
  } | null;
};

export type WatcherAttempt = {
  mode: WatcherMode;
  url: string;
  outcome: "success" | "empty" | "unchanged" | "error";
  candidates: number;
  error?: string;
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
    public trigger?: string,
    public suggestedUrl?: string,
    public attempts: WatcherAttempt[] = [],
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
    u.searchParams.sort();
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

type AntiBotDetection = { trigger: string; suggestedUrl: string };

export function detectAntiBot(
  status: number,
  headers: Pick<Headers, "get">,
  text: string,
  value: string,
): AntiBotDetection | null {
  const origin = new URL(value).origin;
  const suggestedUrl = `${origin}/feed`;
  const server = headers.get("server") || "";
  if (
    headers.get("cf-mitigated") === "challenge" ||
    /cf-browser-verification|challenge-platform|Just a moment|Attention Required! \| Cloudflare/i.test(
      text,
    ) ||
    ((status === 403 || status === 503) && (/cloudflare/i.test(server) || headers.get("cf-ray")))
  )
    return { trigger: "Cloudflare browser challenge", suggestedUrl };
  if (headers.get("x-sucuri-block") || /sucuri website firewall|access denied - sucuri/i.test(text))
    return { trigger: "Sucuri website firewall", suggestedUrl };
  if (/datadome/i.test(text) || headers.get("x-datadome"))
    return { trigger: "DataDome bot protection", suggestedUrl };
  if (/incapsula|imperva/i.test(text) || headers.get("x-iinfo"))
    return { trigger: "Imperva browser challenge", suggestedUrl };
  if (/akamai.*(?:reference|ghost)|_abck/i.test(text) || headers.get("x-akamai-transformed"))
    return { trigger: "Akamai bot protection", suggestedUrl };
  if (/captcha|verify (?:you are|that you're) human|enable javascript and cookies/i.test(text))
    return { trigger: "Human verification challenge", suggestedUrl };
  if (status === 429) return { trigger: "HTTP 429 rate limit", suggestedUrl };
  if (status === 401 || status === 403)
    return { trigger: `HTTP ${status} access policy`, suggestedUrl };
  return null;
}
function decode(value: string): string {
  return (
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      // Numeric character references (&#8217; &#x2019;) — common in WordPress feeds.
      .replace(/&#(\d+);/g, (_m, code) => safeCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_m, code) => safeCodePoint(parseInt(code, 16)))
      .replace(/&amp;/g, "&")
      .trim()
  );
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0x20 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
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
    const antiBot = detectAntiBot(res.status, res.headers, body, current);
    if (antiBot)
      throw new WatcherFailure(
        "blocked",
        `Blocked by ${antiBot.trigger}.`,
        antiBot.trigger,
        antiBot.suggestedUrl,
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
  resolvedUrl: string;
  candidates: Candidate[];
  fetched: number;
  attempts: WatcherAttempt[];
  etag?: string;
  lastModified?: string;
}> {
  const robots = await robotsFor(watcher);
  if (!robots.allowed)
    throw new WatcherFailure("robots_denied", "robots.txt disallows this watcher path.");
  const attempts: WatcherAttempt[] = [];
  const attempted = new Set<string>();
  const cache = new Map<string, Awaited<ReturnType<typeof fetchText>>>();
  let fetched = 0;
  const root = watcher.url;
  const seeds = [...new Set([watcher.alternative_url, root].filter(Boolean) as string[])];
  const safeMessage = (e: unknown) =>
    (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 240);
  const get = async (url: string, retained = false) => {
    const canonical = canonicalizeUrl(url, root)!;
    if (cache.has(canonical)) return cache.get(canonical)!;
    const conditional: Record<string, string> = {};
    if (retained && canonical === watcher.detected_url) {
      if (watcher.etag) conditional["if-none-match"] = watcher.etag;
      if (watcher.last_modified) conditional["if-modified-since"] = watcher.last_modified;
    }
    const response = await fetchText(canonical, conditional);
    cache.set(canonical, response);
    fetched++;
    return response;
  };
  const scoped = (items: Candidate[]) =>
    items.filter((item) => {
      const url = canonicalizeUrl(item.url, root);
      return !!url && inScope(url, watcher);
    });
  const attempt = async (mode: WatcherMode, url: string, retained = false) => {
    const resolvedUrl = canonicalizeUrl(url, root)!;
    const key = `${mode}:${resolvedUrl}`;
    if (attempted.has(key)) return null;
    attempted.add(key);
    try {
      const response = await get(resolvedUrl, retained);
      if (response.status === 304) {
        attempts.push({ mode, url: resolvedUrl, outcome: "unchanged", candidates: 0 });
        return { mode, resolvedUrl, candidates: [] as Candidate[], response };
      }
      let candidates: Candidate[] = [];
      if (mode === "rss") candidates = scoped(parseWebFeed(response.body));
      else if (mode === "sitemap") {
        const parsed = parseSitemap(response.body);
        const urls = [...parsed.urls];
        for (const childUrl of parsed.sitemaps.slice(0, Math.max(0, watcher.max_pages - 1))) {
          try {
            const child = await get(childUrl);
            urls.push(...parseSitemap(child.body).urls);
          } catch (e) {
            attempts.push({
              mode,
              url: canonicalizeUrl(childUrl, root)!,
              outcome: "error",
              candidates: 0,
              error: safeMessage(e),
            });
          }
        }
        candidates = scoped(urls);
        if (candidates.length) {
          const hydrated = await fingerprintPages(candidates, watcher, fetched);
          candidates = hydrated.candidates;
          fetched = Math.max(fetched, hydrated.fetched);
        }
      } else if (mode === "listing") {
        const links = htmlLinks(response.body, response.url, watcher);
        const hydrated =
          watcher.max_depth > 0
            ? await fingerprintPages(links, watcher, fetched)
            : { candidates: links, fetched };
        candidates = scoped(hydrated.candidates);
        fetched = Math.max(fetched, hydrated.fetched);
      } else {
        const pageUrl = canonicalizeUrl(response.url)!;
        if (inScope(pageUrl, watcher))
          candidates = [
            { url: pageUrl, title: watcher.title, fingerprint: hash(normalizeHtml(response.body)) },
          ];
      }
      attempts.push({
        mode,
        url: resolvedUrl,
        outcome: candidates.length ? "success" : "empty",
        candidates: candidates.length,
      });
      if (!candidates.length) return null;
      return { mode, resolvedUrl, candidates, response };
    } catch (e) {
      attempts.push({
        mode,
        url: resolvedUrl,
        outcome: "error",
        candidates: 0,
        error: safeMessage(e),
      });
      return null;
    }
  };
  const finish = (result: NonNullable<Awaited<ReturnType<typeof attempt>>>) => ({
    mode: result.mode,
    resolvedUrl: result.resolvedUrl,
    candidates: result.candidates,
    fetched,
    attempts,
    etag: result.response.headers.get("etag") || undefined,
    lastModified: result.response.headers.get("last-modified") || undefined,
  });

  if (watcher.detected_mode && watcher.detected_url) {
    const retained = await attempt(watcher.detected_mode, watcher.detected_url, true);
    if (retained) return finish(retained);
  }
  for (const seed of seeds) {
    const direct = await attempt("rss", seed);
    if (direct) return finish(direct);
  }
  for (const seed of seeds) {
    try {
      const response = await get(seed);
      for (const link of feedLinks(response.body, response.url)) {
        const feed = await attempt("rss", link);
        if (feed) return finish(feed);
      }
    } catch {
      // The attempt diagnostics are recorded by direct strategies below.
    }
  }
  const origins = [...new Set(seeds.map((seed) => new URL(seed).origin))];
  for (const feed of origins.flatMap((origin) =>
    ["/feed", "/feed/", "/rss", "/rss.xml", "/atom.xml", "/feed.xml"].map(
      (path) => `${origin}${path}`,
    ),
  )) {
    const result = await attempt("rss", feed);
    if (result) return finish(result);
  }
  for (const map of [...seeds, ...robots.sitemaps, ...origins.map((x) => `${x}/sitemap.xml`)]) {
    const result = await attempt("sitemap", map);
    if (result) return finish(result);
  }
  for (const seed of seeds) {
    const result = await attempt("listing", seed);
    if (result) return finish(result);
  }
  for (const seed of seeds) {
    const result = await attempt("page", seed);
    if (result) return finish(result);
  }
  const failure = attempts.find((x) => x.outcome === "error");
  throw new WatcherFailure(
    "parse_failure",
    `No watcher strategy returned usable in-scope output.${failure?.error ? ` First error: ${failure.error}` : ""}`,
    undefined,
    undefined,
    attempts,
  );
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
): Promise<{
  mode: WatcherMode;
  resolvedUrl: string;
  fetched: number;
  discovered: number;
  sample: Candidate[];
  attempts: WatcherAttempt[];
}> {
  const result = await discover({ ...input, id: "test", default_tier: 6, default_tags: [] });
  return {
    mode: result.mode,
    resolvedUrl: result.resolvedUrl,
    fetched: result.fetched,
    discovered: result.candidates.length,
    sample: result.candidates.slice(0, 10),
    attempts: result.attempts,
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
      const retainedChanged =
        watcher.detected_mode !== found.mode || watcher.detected_url !== found.resolvedUrl;
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
          detected_url: found.resolvedUrl,
          last_attempt_at: now,
          last_success_at: now,
          error_count: 0,
          last_error_code: null,
          last_error: "",
          last_error_trigger: null,
          suggested_url: null,
          etag: found.etag ?? null,
          last_modified: found.lastModified ?? null,
        })
        .eq("id", watcher.id);
      results.push({
        watcher: watcher.title || watcher.url,
        mode: found.mode,
        resolvedUrl: found.resolvedUrl,
        retainedChanged,
        attempts: found.attempts,
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
          last_error_trigger: failure.trigger || null,
          suggested_url: failure.suggestedUrl || null,
        })
        .eq("id", watcher.id);
      results.push({
        watcher: watcher.title || watcher.url,
        mode: null,
        resolvedUrl: null,
        retainedChanged: false,
        attempts: failure.attempts,
        fetched: 0,
        discovered: 0,
        changed: 0,
        queued: 0,
        skipped: 0,
        capped: false,
        error: {
          code: failure.code,
          message: failure.message,
          trigger: failure.trigger,
          suggestedUrl: failure.suggestedUrl,
        },
      });
    }
  }
  return { ok: true as const, results, totalQueued: results.reduce((n, x) => n + x.queued, 0) };
}
