import { describe, expect, it } from "vitest";
import { parseWebFeed } from "./feed-parse";

// Contract tests for the behaviours Atlas depends on — not Feedsmith's internals.
// These are the gate for every Feedsmith upgrade: if one of these breaks, the
// bump is not safe to land. See docs/dependencies.md.
describe("parseWebFeed", () => {
  it("picks the alternate link, not the first link, in Atom entries", () => {
    // A feed emitting rel="replies" first must not queue the comments page.
    const entries = parseWebFeed(
      `<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><entry>
         <title>Post</title>
         <link rel="replies" href="https://example.com/post/comments"/>
         <link rel="alternate" href="https://example.com/post"/>
         <id>tag:example.com,2026:1</id>
         <updated>2026-08-01T10:00:00Z</updated>
       </entry></feed>`,
    );
    expect(entries).toEqual([
      {
        url: "https://example.com/post",
        stableId: "tag:example.com,2026:1",
        title: "Post",
        modified: "2026-08-01T10:00:00Z",
      },
    ]);
  });

  it("treats a rel-less Atom link as the alternate and falls back to id", () => {
    expect(
      parseWebFeed(
        `<feed xmlns="http://www.w3.org/2005/Atom"><title>B</title><entry><title>A</title><link href="https://example.com/a"/><id>i1</id></entry></feed>`,
      )[0],
    ).toMatchObject({ url: "https://example.com/a", stableId: "i1" });
    expect(
      parseWebFeed(
        `<feed xmlns="http://www.w3.org/2005/Atom"><title>B</title><entry><title>A</title><id>https://example.com/only-id</id></entry></feed>`,
      )[0],
    ).toMatchObject({ url: "https://example.com/only-id" });
  });

  it("never uses a non-permalink RSS guid as the entry URL", () => {
    const [entry] = parseWebFeed(
      `<rss version="2.0"><channel><title>C</title><item>
         <title>Post</title><link>https://example.com/a</link>
         <guid isPermaLink="false">OPAQUE-123</guid>
         <pubDate>Tue, 01 Aug 2026 10:00:00 GMT</pubDate>
       </item></channel></rss>`,
    );
    expect(entry.url).toBe("https://example.com/a");
    expect(entry.stableId).toBe("OPAQUE-123");
    expect(entry.modified).toBe("Tue, 01 Aug 2026 10:00:00 GMT");

    // A non-permalink guid with no <link> yields no usable URL, so it is dropped.
    expect(
      parseWebFeed(
        `<rss version="2.0"><channel><title>C</title><item><title>X</title><guid isPermaLink="false">OPAQUE</guid></item></channel></rss>`,
      ),
    ).toEqual([]);
  });

  it("uses a permalink guid as the URL when the item has no link", () => {
    expect(
      parseWebFeed(
        `<rss version="2.0"><channel><title>C</title><item><title>P</title><guid isPermaLink="true">https://example.com/perma</guid></item></channel></rss>`,
      )[0],
    ).toMatchObject({ url: "https://example.com/perma", stableId: "https://example.com/perma" });
  });

  it("decodes named, numeric, and CDATA-wrapped entities", () => {
    expect(
      parseWebFeed(
        `<rss version="2.0"><channel><title>C</title><item><title>What now for Power BI? The question I can&#8217;t escape</title><link>https://x.test/a/</link></item></channel></rss>`,
      )[0].title,
    ).toBe("What now for Power BI? The question I can’t escape");
    expect(
      parseWebFeed(
        `<rss version="2.0"><channel><title>C</title><item><title><![CDATA[Warehouse & Lakehouse]]></title><link>https://x.test/b</link></item></channel></rss>`,
      )[0].title,
    ).toBe("Warehouse & Lakehouse");
    expect(
      parseWebFeed(
        `<rss version="2.0"><channel><title>C</title><item><title>Fabric &amp; OneLake</title><link>https://x.test/c</link></item></channel></rss>`,
      )[0].title,
    ).toBe("Fabric & OneLake");
  });

  it("resolves JSON Feed url, then external_url, then id", () => {
    const item = (extra: Record<string, unknown>) =>
      parseWebFeed(
        JSON.stringify({
          version: "https://jsonfeed.org/version/1.1",
          title: "T",
          items: [{ id: "id-1", title: "J", ...extra }],
        }),
      )[0];

    expect(
      item({ url: "https://example.com/u", external_url: "https://example.com/e" }),
    ).toMatchObject({ url: "https://example.com/u", stableId: "id-1" });
    expect(item({ external_url: "https://example.com/e" }).url).toBe("https://example.com/e");
    expect(item({}).url).toBe("id-1");
    expect(
      item({ url: "https://example.com/u", date_published: "2026-03-03T00:00:00Z" }).modified,
    ).toBe("2026-03-03T00:00:00Z");
    expect(
      item({
        url: "https://example.com/u",
        date_modified: "2026-04-04T00:00:00Z",
        date_published: "2026-03-03T00:00:00Z",
      }).modified,
    ).toBe("2026-04-04T00:00:00Z");
  });

  it("parses RDF items, which have no guid and date via dc:date", () => {
    expect(
      parseWebFeed(
        `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
           <channel rdf:about="https://example.com"><title>C</title><link>https://example.com</link></channel>
           <item rdf:about="https://example.com/1"><title>RDF post</title><link>https://example.com/1</link><dc:date>2026-01-01</dc:date></item>
         </rdf:RDF>`,
      )[0],
    ).toEqual({
      url: "https://example.com/1",
      stableId: "https://example.com/1",
      title: "RDF post",
      modified: "2026-01-01",
    });
  });

  // The watcher discovery ladder speculatively parses HTML pages as feeds and
  // depends on an empty result — never a throw — to fall through to the
  // sitemap/listing/page strategies. This is the single most important case.
  it("returns an empty list for anything that is not a feed", () => {
    for (const input of [
      "<html><body><h1>Not a feed</h1></body></html>",
      "",
      "   ",
      "<rss><channel><item><title>truncated",
      "{}",
      "not xml at all",
      '{"items": "not-an-array"}',
    ]) {
      expect(() => parseWebFeed(input)).not.toThrow();
      expect(parseWebFeed(input)).toEqual([]);
    }
  });

  it("returns an empty list for a valid feed with no items", () => {
    expect(
      parseWebFeed(`<rss version="2.0"><channel><title>Empty</title></channel></rss>`),
    ).toEqual([]);
    expect(
      parseWebFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>`),
    ).toEqual([]);
  });
});
