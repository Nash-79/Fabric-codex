import { describe, expect, it } from "vitest";
import {
  classifyRoadmapBlogUrl,
  parseRoadmapEnvelope,
  roadmapReleaseToRow,
  type FabricGpsRelease,
} from "@/lib/rss-poll.server";

const release: FabricGpsRelease = {
  release_item_id: "release-123",
  feature_name: "Pipeline dependencies",
  release_date: "Q3 2026",
  release_type: "Public preview",
  release_status: "Shipped",
  product_id: "product-123",
  product_name: "Data Factory",
  feature_description: "Runs a pipeline after its configured prerequisites are satisfied.",
  blog_title: "Pipeline dependencies in Fabric",
  blog_url: "https://blog.fabric.microsoft.com/en-us/blog/pipeline-dependencies",
  last_modified: "2026-07-14",
  active: true,
};

describe("Fabric GPS roadmap API", () => {
  it("preserves every release field while adding normalized display fields", () => {
    const row = roadmapReleaseToRow(release, "2026-07-14T12:00:00.000Z");

    expect(row).toMatchObject({
      release_item_id: "release-123",
      title: "Pipeline dependencies",
      release_date: "Q3 2026",
      release_status: "Shipped",
      status: "launched",
      product_name: "Data Factory",
      capability_id: "data-factory",
      feature_description: release.feature_description,
      blog_title: release.blog_title,
      blog_url: release.blog_url,
      active: true,
    });
    expect(row.raw_payload).toEqual(release);
    expect(row.link).toBe("https://www.fabric-gps.com/release/release-123");
  });

  it("does not overwrite a curator-assigned capability", () => {
    expect(roadmapReleaseToRow(release, "2026-07-14T12:00:00.000Z", "purview").capability_id).toBe(
      "purview",
    );
  });

  it("only auto-claims canonical sources with an explicit trusted classification", () => {
    expect(classifyRoadmapBlogUrl(release.blog_url!)).toEqual({ tier: 2, autoClaim: true });
    expect(
      classifyRoadmapBlogUrl(
        "https://community.fabric.microsoft.com/t5/Fabric-Updates-Blog/a-release/ba-p/1",
      ),
    ).toEqual({ tier: 2, autoClaim: true });
    expect(classifyRoadmapBlogUrl("https://example.com/reposted-fabric-news")).toEqual({
      tier: 6,
      autoClaim: false,
    });
  });

  it("rejects a non-envelope API response", () => {
    expect(() => parseRoadmapEnvelope({ data: [] })).toThrow(/pagination/);
  });
});
