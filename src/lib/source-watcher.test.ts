import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeUrl,
  canonicalizeUrl,
  detectAntiBot,
  normalizeHtml,
  parseSitemap,
  parseWebFeed,
} from "./source-watcher.server";

afterEach(() => vi.unstubAllGlobals());

describe("source watcher parsing", () => {
  it("parses RSS and Atom entries", () => {
    expect(
      parseWebFeed(
        `<rss><item><title>A</title><link>https://example.com/a</link><guid>1</guid></item></rss>`,
      )[0],
    ).toMatchObject({ title: "A", url: "https://example.com/a", stableId: "1" });
    expect(
      parseWebFeed(
        `<feed><entry><title>B</title><link href="https://example.com/b"/><id>2</id></entry></feed>`,
      )[0],
    ).toMatchObject({ title: "B", url: "https://example.com/b", stableId: "2" });
  });

  it("parses JSON Feed, sitemap URLs, and sitemap indexes", () => {
    expect(
      parseWebFeed(
        JSON.stringify({ items: [{ id: "x", url: "https://example.com/x", title: "X" }] }),
      ),
    ).toHaveLength(1);
    expect(
      parseSitemap(
        `<urlset><url><loc>https://example.com/a</loc><lastmod>2026-01-01</lastmod></url></urlset>`,
      ).urls,
    ).toHaveLength(1);
    expect(
      parseSitemap(
        `<sitemapindex><sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap></sitemapindex>`,
      ).sitemaps,
    ).toEqual(["https://example.com/sitemap-1.xml"]);
  });

  it("canonicalizes tracking URLs and removes volatile HTML chrome", () => {
    expect(canonicalizeUrl("/a?utm_source=x&b=2#top", "https://EXAMPLE.com/root")).toBe(
      "https://example.com/a?b=2",
    );
    expect(
      normalizeHtml(
        `<header>menu</header><main class="x">Useful text</main><script>alert(1)</script>`,
      ),
    ).toBe("Useful text");
  });

  it("canonicalizes equivalent query parameter orders to one queue URL", () => {
    const first = canonicalizeUrl("https://example.com/post?b=2&a=1&utm_medium=rss");
    const second = canonicalizeUrl("https://EXAMPLE.com/post?a=1&b=2#comments");
    expect(first).toBe("https://example.com/post?a=1&b=2");
    expect(second).toBe(first);
  });

  it("rejects private destinations", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/admin")).rejects.toThrow(
      "Private network destinations",
    );
  });

  it("classifies challenge pages without including their body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("Just a moment... SECRET RESPONSE BODY", {
            status: 403,
            statusText: "Forbidden",
            headers: { "content-type": "text/html" },
          }),
      ),
    );
    const { testWatcher } = await import("./source-watcher.server");
    await expect(
      testWatcher({
        url: "https://example.com/blog",
        title: "Example",
        mode: "auto",
        alternative_url: null,
        allowed_host: "example.com",
        allowed_path_prefix: "/",
        max_depth: 1,
        max_pages: 10,
        last_success_at: null,
        etag: null,
        last_modified: null,
      }),
    ).rejects.toThrow("Cloudflare browser challenge");
    await expect(
      testWatcher({
        url: "https://example.com/blog",
        title: "Example",
        mode: "auto",
        alternative_url: null,
        allowed_host: "example.com",
        allowed_path_prefix: "/",
        max_depth: 1,
        max_pages: 10,
        last_success_at: null,
        etag: null,
        last_modified: null,
      }),
    ).rejects.not.toThrow("SECRET RESPONSE BODY");
  });

  it("identifies the protection trigger and suggests a first-party feed", () => {
    const headers = new Headers({ server: "cloudflare", "cf-ray": "abc-LHR" });
    expect(detectAntiBot(403, headers, "Just a moment", "https://example.com/news/post")).toEqual({
      trigger: "Cloudflare browser challenge",
      suggestedUrl: "https://example.com/feed",
    });
    expect(detectAntiBot(429, new Headers(), "", "https://example.com/news")).toEqual({
      trigger: "HTTP 429 rate limit",
      suggestedUrl: "https://example.com/feed",
    });
  });
});
