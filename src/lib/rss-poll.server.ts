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
  error: string | null;
};

type RssEntry = { link: string; title: string; guid: string; published: string };

export const FIRST_POLL_CAP = 25;
export const FABRIC_ROADMAP_FEED_URL = "https://www.fabric-gps.com/rss";

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

function tagTextAll(block: string, tag: string): string[] {
  const matches = block.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"));
  return [...matches].map((m) => decodeXmlEntities(m[1])).filter(Boolean);
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
          accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
          "accept-language": "en-US,en;q=0.9",
          "user-agent":
            "Mozilla/5.0 (compatible; FabricAtlasBot/1.0; +https://fabric-atlas.lovable.app/) AppleWebKit/537.36",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        const bodySnippet = (await res.text().catch(() => "")).slice(0, 300);
        throw new Error(`HTTP ${res.status} ${res.statusText || ""}${bodySnippet ? ` — ${bodySnippet.replace(/\s+/g, " ")}` : ""}`.trim());
      }
      const xml = await res.text();
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
};

function deriveRoadmapStatus(categories: string[]): string {
  for (const c of categories) {
    const mapped = ROADMAP_STATUS_CATEGORIES[c.trim().toLowerCase()];
    if (mapped) return mapped;
  }
  return "planned";
}

function deriveReleaseType(categories: string[]): string {
  return categories.find((c) => !(c.trim().toLowerCase() in ROADMAP_STATUS_CATEGORIES)) ?? "";
}

function parseTargetRelease(descriptionHtml: string): string {
  const m = descriptionHtml.match(/Planned[^:<]*Date:<\/strong>\s*([^<]+)/i);
  return m ? m[1].trim() : "";
}

export async function pollFabricRoadmapCore(sb: SupabaseAdmin): Promise<RoadmapPollResult> {
  const nowIso = new Date().toISOString();

  try {
    const res = await fetch(FABRIC_ROADMAP_FEED_URL, {
      headers: {
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (compatible; FabricAtlasBot/1.0; +https://fabric-atlas.lovable.app/) AppleWebKit/537.36",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      const bodySnippet = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`HTTP ${res.status} ${res.statusText || ""}${bodySnippet ? ` — ${bodySnippet.replace(/\s+/g, " ")}` : ""}`.trim());
    }
    const xml = await res.text();

    const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
    let created = 0;
    let updated = 0;

    for (const block of blocks) {
      const link = entryLink(block);
      const guid = tagText(block, "guid") || link;
      if (!guid) continue;
      const title = tagText(block, "title");
      const pubDateRaw = tagText(block, "pubDate");
      const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
      const categories = tagTextAll(block, "category");
      const descriptionHtml = tagText(block, "description");

      const row = {
        guid,
        title,
        link,
        status: deriveRoadmapStatus(categories),
        release_type: deriveReleaseType(categories),
        target_release: parseTargetRelease(descriptionHtml),
        categories,
        description_html: descriptionHtml,
        pub_date: pubDate && !Number.isNaN(pubDate.getTime()) ? pubDate.toISOString() : null,
        last_seen_at: nowIso,
      };

      const { data: existing } = await sb
        .from("roadmap_items")
        .select("id")
        .eq("guid", guid)
        .maybeSingle();

      if (existing) {
        const { error } = await sb.from("roadmap_items").update(row).eq("guid", guid);
        if (error) throw new Error(error.message);
        updated++;
      } else {
        const { error } = await sb.from("roadmap_items").insert(row);
        if (error) throw new Error(error.message);
        created++;
      }
    }

    await sb
      .from("roadmap_sync_state")
      .update({ last_polled_at: nowIso, error_count: 0, last_error: "" })
      .eq("id", true);

    return { ok: true, found: blocks.length, created, updated, error: null };
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
    return { ok: false, found: 0, created: 0, updated: 0, error: reason };
  }
}
