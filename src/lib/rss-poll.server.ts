type SupabaseAdmin = any;

export type RssPollResult = {
  ok: true;
  results: Array<{
    feed: string;
    found: number;
    queued: number;
    skipped: number;
    capped: boolean;
    error: string | null;
  }>;
  totalQueued: number;
};

export type RoadmapPollResult = {
  ok: boolean;
  found: number;
  created: number;
  updated: number;
  blogsQueued: number;
  blogsAutoClaimed: number;
  pages: number;
  error: string | null;
};

type RssEntry = { link: string; title: string; guid: string; published: string };

export const FIRST_POLL_CAP = 25;
export const FABRIC_ROADMAP_API_URL = "https://www.fabric-gps.com/api/releases";

function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function tagText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeXmlEntities(m[1]) : "";
}

function entryLink(block: string): string {
  const text = tagText(block, "link");
  if (text) return text;
  const href = block.match(/<link[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
  return href ? decodeXmlEntities(href[1]) : "";
}

export function parseFeed(xml: string): RssEntry[] {
  const entries: RssEntry[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) ?? [];
  for (const block of blocks) {
    const link = entryLink(block);
    const guid = tagText(block, "guid") || tagText(block, "id") || link;
    const title = tagText(block, "title");
    const published =
      tagText(block, "pubDate") || tagText(block, "published") || tagText(block, "updated");
    if (link || guid) entries.push({ link: link || guid, title, guid: guid || link, published });
  }
  return entries;
}

export async function pollRssFeedsCore(
  sb: SupabaseAdmin,
  opts: { feedId?: string; actorId?: string | null } = {},
): Promise<RssPollResult> {
  let query = sb
    .from("rss_subscriptions")
    .select("id,feed_url,title,default_tier,default_tags,last_seen_guid,last_polled_at,status")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (opts.feedId) query = query.eq("id", opts.feedId);
  const { data: feeds, error: feedError } = await query;
  if (feedError) throw new Error(feedError.message);

  const nowIso = new Date().toISOString();
  const results: RssPollResult["results"] = [];

  for (const feed of feeds ?? []) {
    const label = feed.title || feed.feed_url;
    try {
      const res = await fetch(feed.feed_url, {
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/atom+xml,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "accept-encoding": "gzip, deflate, br",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "document",
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "none",
          "sec-fetch-user": "?1",
          "upgrade-insecure-requests": "1",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        const bodySnippet = (await res.text().catch(() => "")).slice(0, 300);
        throw new Error(
          `HTTP ${res.status} ${res.statusText || ""}${bodySnippet ? ` — ${bodySnippet.replace(/\s+/g, " ")}` : ""}`.trim(),
        );
      }
      const body = await res.text();
      if (/Just a moment\.\.\.|cf-browser-verification|challenge-platform/i.test(body)) {
        throw new Error(
          "Cloudflare bot challenge — feed host requires JS challenge (cf_clearance). Consider a proxy service or contact publisher for an unprotected URL.",
        );
      }
      const xml = body;
      const all = parseFeed(xml).reverse();

      const firstPoll = !feed.last_seen_guid;
      let entries = all;
      let capped = false;
      if (firstPoll && all.length > FIRST_POLL_CAP) {
        entries = all.slice(all.length - FIRST_POLL_CAP);
        capped = true;
      } else if (!firstPoll) {
        const seenIdx = all.findIndex((e) => e.guid === feed.last_seen_guid);
        entries = seenIdx >= 0 ? all.slice(seenIdx + 1) : all;
      }

      let queued = 0;
      let skipped = 0;
      for (const entry of entries) {
        const url = entry.link;
        if (!url) continue;
        const { data: existingSource } = await sb
          .from("sources")
          .select("slug")
          .eq("url", url)
          .maybeSingle();
        if (existingSource) {
          skipped++;
          continue;
        }
        const { data: openItem } = await sb
          .from("queue_items")
          .select("id")
          .eq("url", url)
          .in("status", ["queued", "claimed"])
          .maybeSingle();
        if (openItem) {
          skipped++;
          continue;
        }
        const note = `via RSS: ${label}`;
        const { error: insertError } = await sb.from("queue_items").insert({
          url,
          title: entry.title?.trim() ?? "",
          tier: feed.default_tier,
          tags: feed.default_tags ?? [],
          kind: "source",
          notes: note,
          submitted_by: opts.actorId ?? null,
          status: "queued",
        });
        if (insertError) {
          if ((insertError as { code?: string }).code === "23505") skipped++;
          else throw new Error(insertError.message);
        } else {
          queued++;
        }
      }

      const newestGuid = all.length ? all[all.length - 1].guid : feed.last_seen_guid;
      await sb
        .from("rss_subscriptions")
        .update({
          last_polled_at: nowIso,
          last_seen_guid: newestGuid,
          error_count: 0,
          last_error: "",
        })
        .eq("id", feed.id);

      results.push({ feed: label, found: entries.length, queued, skipped, capped, error: null });
    } catch (err) {
      const reason = (err as Error).message.slice(0, 200);
      const { data: cur } = await sb
        .from("rss_subscriptions")
        .select("error_count")
        .eq("id", feed.id)
        .maybeSingle();
      await sb
        .from("rss_subscriptions")
        .update({
          last_polled_at: nowIso,
          error_count: (cur?.error_count ?? 0) + 1,
          last_error: reason,
        })
        .eq("id", feed.id);
      results.push({
        feed: label,
        found: 0,
        queued: 0,
        skipped: 0,
        capped: false,
        error: reason,
      });
    }
  }

  const totalQueued = results.reduce((n, r) => n + r.queued, 0);
  return { ok: true, results, totalQueued };
}

const ROADMAP_STATUS_CATEGORIES: Record<string, string> = {
  planned: "planned",
  "rolling out": "rolling_out",
  launched: "launched",
  shipped: "launched",
};

export type FabricGpsRelease = {
  release_item_id: string;
  feature_name: string;
  release_date: string | null;
  release_type: string;
  release_status: string;
  product_id: string | null;
  product_name: string;
  feature_description: string | null;
  blog_title: string | null;
  blog_url: string | null;
  last_modified: string;
  active: boolean;
};

type FabricGpsEnvelope = {
  data: FabricGpsRelease[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
    has_next: boolean;
    next_page: number | null;
  };
};

const PRODUCT_CAPABILITIES: Record<string, string> = {
  "Data Factory": "data-factory",
  "Data Warehouse": "warehouse",
  IQ: "fabric-iq",
  OneLake: "onelake",
  "Power BI": "power-bi",
  "Real-Time Intelligence": "rti",
  "SQL database": "sql-database",
};

function deriveRoadmapStatus(releaseStatus: string): string {
  return ROADMAP_STATUS_CATEGORIES[releaseStatus.trim().toLowerCase()] ?? "planned";
}

function canonicalizeBlogUrl(value: string): string {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Blog URL must use http(s).");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function classifyRoadmapBlogUrl(value: string): { tier: number; autoClaim: boolean } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { tier: 6, autoClaim: false };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "learn.microsoft.com") return { tier: 1, autoClaim: true };
  if (host === "blog.fabric.microsoft.com" || host === "powerbi.microsoft.com") {
    return { tier: 2, autoClaim: true };
  }
  if (
    host === "community.fabric.microsoft.com" &&
    url.pathname.toLowerCase().startsWith("/t5/fabric-updates-blog/")
  ) {
    return { tier: 2, autoClaim: true };
  }
  if (host === "github.com" && /^\/(microsoft|microsoftdocs)\//i.test(url.pathname)) {
    return { tier: 3, autoClaim: true };
  }
  return { tier: 6, autoClaim: false };
}

export function parseRoadmapEnvelope(value: unknown): FabricGpsEnvelope {
  if (!value || typeof value !== "object") throw new Error("Fabric GPS returned invalid JSON.");
  const envelope = value as Partial<FabricGpsEnvelope>;
  if (!Array.isArray(envelope.data) || !envelope.pagination) {
    throw new Error("Fabric GPS response is missing data or pagination metadata.");
  }
  return envelope as FabricGpsEnvelope;
}

export function roadmapReleaseToRow(
  release: FabricGpsRelease,
  nowIso: string,
  existingCapability: string | null = null,
) {
  const releaseLink = `https://www.fabric-gps.com/release/${encodeURIComponent(release.release_item_id)}`;
  return {
    guid: releaseLink,
    release_item_id: release.release_item_id,
    title: release.feature_name,
    feature_name: release.feature_name,
    link: releaseLink,
    status: deriveRoadmapStatus(release.release_status),
    release_type: release.release_type,
    release_status: release.release_status,
    target_release: release.release_date ?? "",
    release_date: release.release_date,
    product_id: release.product_id,
    product_name: release.product_name,
    feature_description: release.feature_description,
    blog_title: release.blog_title,
    blog_url: release.blog_url,
    last_modified: release.last_modified,
    active: release.active,
    categories: [release.release_type, release.release_status].filter(Boolean),
    description_html: "",
    pub_date: release.last_modified ? `${release.last_modified}T00:00:00.000Z` : null,
    capability_id: existingCapability ?? PRODUCT_CAPABILITIES[release.product_name] ?? null,
    raw_payload: release,
    last_seen_at: nowIso,
  };
}

function chunks<T>(values: T[], size = 50): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

function productTag(productName: string): string {
  return productName.replace(/[^A-Za-z0-9]+/g, "");
}

async function enqueueRoadmapBlogs(
  sb: SupabaseAdmin,
  releases: FabricGpsRelease[],
  nowIso: string,
): Promise<{ queued: number; autoClaimed: number }> {
  const byUrl = new Map<string, FabricGpsRelease[]>();
  for (const release of releases) {
    if (!release.blog_url) continue;
    try {
      const url = canonicalizeBlogUrl(release.blog_url);
      byUrl.set(url, [...(byUrl.get(url) ?? []), release]);
    } catch {
      // Invalid upstream URLs remain preserved in raw_payload, but cannot enter the source queue.
    }
  }

  const urls = [...byUrl.keys()];
  const unavailable = new Set<string>();
  for (const batch of chunks(urls)) {
    const [{ data: sources, error: sourceError }, { data: queue, error: queueError }] =
      await Promise.all([
        sb.from("sources").select("url").in("url", batch),
        sb.from("queue_items").select("url").in("url", batch).in("status", ["queued", "claimed"]),
      ]);
    if (sourceError) throw new Error(sourceError.message);
    if (queueError) throw new Error(queueError.message);
    for (const row of [...(sources ?? []), ...(queue ?? [])]) unavailable.add(row.url);
  }

  const rows = urls
    .filter((url) => !unavailable.has(url))
    .map((url) => {
      const related = byUrl.get(url)!;
      const first = related[0];
      const classification = classifyRoadmapBlogUrl(url);
      const ids = related.map((r) => r.release_item_id).join(",");
      const products = [...new Set(related.map((r) => r.product_name))];
      return {
        url,
        title: first.blog_title?.trim() || first.feature_name,
        tier: classification.tier,
        tags: ["MicrosoftFabric", "Roadmap", ...products.map(productTag)].filter(Boolean),
        kind: "source",
        notes: `discovered via fabric-gps-roadmap ${ids}; canonical blog linked by roadmap API; products=${products.join(", ")}`,
        submitted_by: null,
        status: classification.autoClaim ? "claimed" : "queued",
        claimed_at: classification.autoClaim ? nowIso : null,
      };
    });

  for (const batch of chunks(rows)) {
    if (!batch.length) continue;
    const { error } = await sb.from("queue_items").insert(batch);
    if (error) throw new Error(error.message);
  }
  return {
    queued: rows.length,
    autoClaimed: rows.filter((row) => row.status === "claimed").length,
  };
}

export async function pollFabricRoadmapCore(sb: SupabaseAdmin): Promise<RoadmapPollResult> {
  const nowIso = new Date().toISOString();

  try {
    const releases: FabricGpsRelease[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const url = new URL(FABRIC_ROADMAP_API_URL);
      url.searchParams.set("include_inactive", "true");
      url.searchParams.set("sort", "last_modified");
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", "200");
      const res = await fetch(url, {
        headers: {
          accept: "application/json",
          "accept-language": "en-US,en;q=0.9",
          "user-agent": "FabricAtlasBot/1.0 (+https://fabric-atlas.lovable.app/)",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        const bodySnippet = (await res.text().catch(() => "")).slice(0, 300);
        throw new Error(
          `HTTP ${res.status} ${res.statusText || ""}${bodySnippet ? ` — ${bodySnippet.replace(/\s+/g, " ")}` : ""}`.trim(),
        );
      }
      const envelope = parseRoadmapEnvelope(await res.json());
      releases.push(...envelope.data);
      totalPages = envelope.pagination.total_pages;
      page++;
    } while (page <= totalPages);

    let created = 0;
    let updated = 0;
    for (const batch of chunks(releases, 200)) {
      const guids = batch.map(
        (release) =>
          `https://www.fabric-gps.com/release/${encodeURIComponent(release.release_item_id)}`,
      );
      const { data: existing, error: existingError } = await sb
        .from("roadmap_items")
        .select("guid,capability_id")
        .in("guid", guids);
      if (existingError) throw new Error(existingError.message);
      const capabilities = new Map(
        (existing ?? []).map((row: { guid: string; capability_id: string | null }) => [
          row.guid,
          row.capability_id,
        ]),
      );
      created += batch.length - capabilities.size;
      updated += capabilities.size;
      const rows = batch.map((release) => {
        const guid = `https://www.fabric-gps.com/release/${encodeURIComponent(release.release_item_id)}`;
        return roadmapReleaseToRow(release, nowIso, capabilities.get(guid) ?? null);
      });
      const { error } = await sb.from("roadmap_items").upsert(rows, { onConflict: "guid" });
      if (error) throw new Error(error.message);
    }

    const blogs = await enqueueRoadmapBlogs(sb, releases, nowIso);

    await sb
      .from("roadmap_sync_state")
      .update({ last_polled_at: nowIso, error_count: 0, last_error: "" })
      .eq("id", true);

    return {
      ok: true,
      found: releases.length,
      created,
      updated,
      blogsQueued: blogs.queued,
      blogsAutoClaimed: blogs.autoClaimed,
      pages: totalPages,
      error: null,
    };
  } catch (err) {
    const reason = (err as Error).message.slice(0, 200);
    const { data: cur } = await sb
      .from("roadmap_sync_state")
      .select("error_count")
      .eq("id", true)
      .maybeSingle();
    await sb
      .from("roadmap_sync_state")
      .update({
        last_polled_at: nowIso,
        error_count: (cur?.error_count ?? 0) + 1,
        last_error: reason,
      })
      .eq("id", true);
    return {
      ok: false,
      found: 0,
      created: 0,
      updated: 0,
      blogsQueued: 0,
      blogsAutoClaimed: 0,
      pages: 0,
      error: reason,
    };
  }
}
