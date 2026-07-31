import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { buildContentStamp } from "@/lib/atlas.functions";
import {
  CONTENT_QUERY_FAMILIES,
  currentStamp,
  invalidateContentQueries,
  CONTENT_VERSION_KEY,
} from "@/lib/content-version";

describe("buildContentStamp", () => {
  const items = { data: [{ updated_at: "2026-07-31T10:00:00Z" }], count: 12 };
  const diagrams = { data: [{ updated_at: "2026-07-30T09:00:00Z" }], count: 5 };

  it("is stable for unchanged content", () => {
    expect(buildContentStamp(items, diagrams)).toBe(buildContentStamp(items, diagrams));
  });

  it("moves when an item is republished", () => {
    const later = { data: [{ updated_at: "2026-07-31T11:00:00Z" }], count: 12 };
    expect(buildContentStamp(later, diagrams)).not.toBe(buildContentStamp(items, diagrams));
  });

  it("moves when an item is deleted even if timestamps are unchanged", () => {
    expect(buildContentStamp({ ...items, count: 11 }, diagrams)).not.toBe(
      buildContentStamp(items, diagrams),
    );
  });

  it("moves when a diagram is registered", () => {
    expect(buildContentStamp(items, { ...diagrams, count: 6 })).not.toBe(
      buildContentStamp(items, diagrams),
    );
  });

  it("tolerates empty tables", () => {
    expect(buildContentStamp({ data: [], count: 0 }, { data: null, count: null })).toBe("0:0|0:0");
  });
});

describe("content cache invalidation", () => {
  it("defaults the stamp before the first fetch resolves", () => {
    expect(currentStamp(new QueryClient())).toBe("0");
  });

  it("reads the fetched stamp", () => {
    const qc = new QueryClient();
    qc.setQueryData(CONTENT_VERSION_KEY, { stamp: "abc", ok: true });
    expect(currentStamp(qc)).toBe("abc");
  });

  it("invalidates every content family, including article and prev/next data", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries").mockResolvedValue();
    invalidateContentQueries(qc);
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0]);
    expect(keys).toEqual([...CONTENT_QUERY_FAMILIES]);
    expect(keys).toContain("content-item");
    expect(keys).toContain("content-siblings");
  });
});
