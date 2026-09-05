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
        `<rss version="2.0"><channel><item><title>A</title><link>https://example.com/a</link><guid>1</guid></item></channel></rss>`,
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
        JSON.stringify({
          version: "https://jsonfeed.org/version/1.1",
          items: [{ id: "x", url: "https://example.com/x", title: "X" }],
        }),
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

  // The guard runs on Cloudflare Workers, where node:dns does not exist -- so it must decide
  // from the URL alone. These cover the literal forms it can still reject.
  it.each([
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fd00::1]/",
  ])("rejects the private literal %s", async (u) => {
    await expect(assertSafeUrl(u)).rejects.toThrow("Private network destinations");
  });

  it.each([
    "http://localhost/",
    "http://foo.local/",
    "http://bar.internal/",
    "http://metadata.google.internal/",
  ])("rejects the local hostname %s", async (u) => {
    await expect(assertSafeUrl(u)).rejects.toThrow("Local network destinations");
  });

  it("rejects credentialed and non-HTTP URLs", async () => {
    await expect(assertSafeUrl("http://user:pw@example.com/")).rejects.toThrow(
      "credential-free HTTP(S)",
    );
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow("credential-free HTTP(S)");
  });

  it("allows ordinary public URLs", async () => {
    await expect(assertSafeUrl("https://example.com/feed.xml")).resolves.toBeInstanceOf(URL);
    await expect(assertSafeUrl("https://8.8.8.8/")).resolves.toBeInstanceOf(URL);
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

  it("tries the retained mapping first and sends its conditional headers", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /");
      expect(url).toBe("https://example.com/retained.xml");
      expect(new Headers(init?.headers).get("if-none-match")).toBe('"feed-v1"');
      return new Response(
        `<rss version="2.0"><channel><item><title>Retained</title><link>https://example.com/article</link></item></channel></rss>`,
        { headers: { "content-type": "application/rss+xml", etag: '"feed-v2"' } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { testWatcher } = await import("./source-watcher.server");
    const result = await testWatcher({
      url: "https://example.com/news",
      title: "Example",
      mode: "auto",
      detected_mode: "rss",
      detected_url: "https://example.com/retained.xml",
      alternative_url: null,
      allowed_host: "example.com",
      allowed_path_prefix: "/",
      max_depth: 1,
      max_pages: 10,
      last_success_at: "2026-07-11T00:00:00Z",
      etag: '"feed-v1"',
      last_modified: null,
    });
    expect(result).toMatchObject({
      mode: "rss",
      resolvedUrl: "https://example.com/retained.xml",
      discovered: 1,
    });
    expect(result.attempts).toEqual([
      expect.objectContaining({ mode: "rss", outcome: "success", candidates: 1 }),
    ]);
  });

  it("falls through a failed discovered feed to listing output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /");
        if (url === "https://example.com/news")
          return new Response(
            `<html><head><link rel="alternate" type="application/rss+xml" href="/broken.xml"></head><body><a href="/article">Article</a></body></html>`,
            { headers: { "content-type": "text/html" } },
          );
        if (url === "https://example.com/article")
          return new Response("<html><title>Article</title><main>Useful article</main></html>", {
            headers: { "content-type": "text/html" },
          });
        return new Response("missing", { status: 404 });
      }),
    );
    const { testWatcher } = await import("./source-watcher.server");
    const result = await testWatcher({
      url: "https://example.com/news",
      title: "Example",
      mode: "auto",
      detected_mode: null,
      detected_url: null,
      alternative_url: null,
      allowed_host: "example.com",
      allowed_path_prefix: "/",
      max_depth: 1,
      max_pages: 20,
      last_success_at: null,
      etag: null,
      last_modified: null,
    });
    expect(result.mode).toBe("listing");
    expect(result.sample[0].url).toBe("https://example.com/article");
    expect(result.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          mode: "rss",
          url: "https://example.com/broken.xml",
          outcome: "error",
        }),
        expect.objectContaining({ mode: "listing", outcome: "success", candidates: 1 }),
      ]),
    );
  });
});

it("decodes numeric HTML entities in feed titles", () => {
  const items = parseWebFeed(
    `<rss><channel><item><title>What now for Power BI? The question I can&#8217;t escape</title><link>https://x.test/a/</link></item></channel></rss>`,
  );
  expect(items[0].title).toBe("What now for Power BI? The question I can’t escape");
});
