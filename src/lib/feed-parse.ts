// Feed parsing for every watcher and poller path in Atlas.
//
// Parsing is backed by Feedsmith (https://github.com/macieklamberski/feedsmith),
// MIT-licensed, © Maciej Lamberski. It handles RSS 0.9x/2.0, Atom 0.3/1.0,
// RDF 0.9/1.0, and JSON Feed 1.0/1.1 with namespace support, replacing the
// hand-rolled regex parsers this module supersedes. See docs/dependencies.md.
//
// This module owns the ONE normalization from Feedsmith's per-format shapes to
// the single `ParsedEntry` the rest of the codebase consumes. Do not parse feed
// bytes anywhere else.
import { parseFeed } from "feedsmith";

export type ParsedEntry = {
  url: string;
  stableId: string;
  title: string;
  modified: string;
};

type AtomLink = { href?: string; rel?: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Atom entries carry several <link>s (alternate, replies, edit, enclosure).
 * The article is the `alternate` one — or a bare <link> with no rel, which the
 * spec defines as alternate. Taking the first link regardless of rel queues the
 * comments page as the article, which is exactly what the old regex parser did.
 */
function atomLink(links: unknown): string {
  if (!Array.isArray(links)) return "";
  const candidates = links as AtomLink[];
  const alternate = candidates.find((link) => !link.rel || link.rel === "alternate");
  return text(alternate?.href) || text(candidates.find((link) => link.href)?.href);
}

/**
 * An RSS <guid> is only a URL when isPermaLink is not false; otherwise it is an
 * opaque identifier and must never be used as the entry URL.
 */
function rssGuid(guid: unknown): { value: string; isPermaLink: boolean } {
  if (typeof guid === "string") return { value: guid.trim(), isPermaLink: true };
  const record = (guid ?? {}) as { value?: unknown; isPermaLink?: unknown };
  return { value: text(record.value), isPermaLink: record.isPermaLink !== false };
}

/**
 * Parses any supported feed format into a uniform entry list.
 *
 * Returns `[]` for anything that is not a parseable feed. This is load-bearing:
 * the watcher discovery ladder speculatively tries RSS parsing on URLs that are
 * usually plain HTML and relies on an empty result to fall through to the
 * sitemap/listing/page strategies. Feedsmith throws on unrecognized input, so
 * the throw is converted back into an empty list here — never let it escape.
 */
export function parseWebFeed(body: string): ParsedEntry[] {
  let parsed: ReturnType<typeof parseFeed>;
  try {
    parsed = parseFeed(body);
  } catch {
    return [];
  }

  const feed = parsed.feed as Record<string, unknown>;
  const rows = (parsed.format === "atom" ? feed.entries : feed.items) as
    Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => {
      const title = text(row.title);

      if (parsed.format === "atom") {
        const id = text(row.id);
        const url = atomLink(row.links) || id;
        return {
          url,
          stableId: id || url,
          title,
          modified: text(row.updated) || text(row.published),
        };
      }

      if (parsed.format === "json") {
        const url = text(row.url) || text(row.external_url) || text(row.id);
        return {
          url,
          stableId: text(row.id) || url,
          title,
          modified: text(row.date_modified) || text(row.date_published),
        };
      }

      // RSS and RDF. RDF items have no <guid>; they identify by <link> and
      // carry their timestamp in dc:date rather than <pubDate>.
      const guid = rssGuid(row.guid);
      const link = text(row.link);
      const url = link || (guid.isPermaLink ? guid.value : "");
      const dc = (row.dc ?? {}) as { date?: unknown };
      return {
        url,
        stableId: guid.value || url,
        title,
        modified: text(row.pubDate) || text(dc.date),
      };
    })
    .filter((entry) => entry.url);
}
