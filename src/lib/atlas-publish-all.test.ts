import { describe, expect, it } from "vitest";
import { contentPublishDocument, stableJson } from "./atlas-publish-all.server";

describe("Publish all document comparison", () => {
  it("matches the document shape persisted by publishContentItem", () => {
    const bundled = { slug: "direct-lake", title: "Direct Lake", body_md: "Body" };
    const persisted = {
      kind: "article",
      body_md: "Body",
      title: "Direct Lake",
      slug: "direct-lake",
    };

    expect(stableJson(contentPublishDocument("article", bundled))).toBe(stableJson(persisted));
  });

  it("still detects a real content change", () => {
    const bundled = contentPublishDocument("article", {
      slug: "direct-lake",
      title: "Direct Lake",
      body_md: "Changed body",
    });
    const persisted = {
      kind: "article",
      slug: "direct-lake",
      title: "Direct Lake",
      body_md: "Old body",
    };

    expect(stableJson(bundled)).not.toBe(stableJson(persisted));
  });
});
