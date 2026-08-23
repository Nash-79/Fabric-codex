import { describe, expect, it } from "vitest";
import { findResumeItem, isItemDone, isPositionLocked, itemKey } from "./learning-path-ui";
import type { LearningPathItem } from "@/lib/atlas.functions";

function item(slug: string, kind: LearningPathItem["content_kind"] = "lesson"): LearningPathItem {
  return {
    content_kind: kind,
    content_slug: slug,
    position: 0,
    optional: false,
    title: slug,
    summary: "",
    depth_levels: [],
    lesson_meta: null,
    prerequisite_ids: [],
  };
}

describe("isItemDone", () => {
  it("is true only for a completed status", () => {
    expect(isItemDone({ status: "completed", percent: 100 })).toBe(true);
    expect(isItemDone({ status: "in_progress", percent: 50 })).toBe(false);
    expect(isItemDone(undefined)).toBe(false);
  });
});

describe("findResumeItem", () => {
  it("returns the first item when nothing is done", () => {
    const items = [item("a"), item("b"), item("c")];
    expect(findResumeItem(items, new Map())).toEqual(item("a"));
  });

  it("returns the first NOT-done item, not the first item overall", () => {
    const items = [item("a"), item("b"), item("c")];
    const progress = new Map([
      [itemKey(item("a")), { status: "completed" as const, percent: 100 }],
    ]);
    expect(findResumeItem(items, progress)).toEqual(item("b"));
  });

  it("skips multiple completed items in a row", () => {
    const items = [item("a"), item("b"), item("c"), item("d")];
    const progress = new Map([
      [itemKey(item("a")), { status: "completed" as const, percent: 100 }],
      [itemKey(item("b")), { status: "completed" as const, percent: 100 }],
      [itemKey(item("c")), { status: "completed" as const, percent: 100 }],
    ]);
    expect(findResumeItem(items, progress)).toEqual(item("d"));
  });

  it("returns the first item (for review) when everything is done", () => {
    const items = [item("a"), item("b")];
    const progress = new Map([
      [itemKey(item("a")), { status: "completed" as const, percent: 100 }],
      [itemKey(item("b")), { status: "completed" as const, percent: 100 }],
    ]);
    expect(findResumeItem(items, progress)).toEqual(item("a"));
  });

  it("returns null for an empty path", () => {
    expect(findResumeItem([], new Map())).toBeNull();
  });

  // Distinct content kinds sharing a slug must not collide via itemKey — e.g. an article and a
  // design both named "onelake" in the same path are two different items.
  it("does not conflate items with the same slug but different kind", () => {
    const items = [item("onelake", "article"), item("onelake", "design")];
    const progress = new Map([
      [itemKey(item("onelake", "article")), { status: "completed" as const, percent: 100 }],
    ]);
    expect(findResumeItem(items, progress)).toEqual(item("onelake", "design"));
  });
});

describe("isPositionLocked", () => {
  it("the first item is never locked", () => {
    const items = [item("a"), item("b")];
    expect(isPositionLocked(items, 0, new Map())).toBe(false);
  });

  it("an item is locked while the prior item is not done", () => {
    const items = [item("a"), item("b")];
    expect(isPositionLocked(items, 1, new Map())).toBe(true);
  });

  it("an item unlocks once the prior item is done", () => {
    const items = [item("a"), item("b")];
    const progress = new Map([
      [itemKey(item("a")), { status: "completed" as const, percent: 100 }],
    ]);
    expect(isPositionLocked(items, 1, progress)).toBe(false);
  });

  it("only checks the immediately prior item, not the whole prefix", () => {
    // b is done but a is not — c should be unlocked (prior item, b, is done), even though a,
    // earlier in the path, isn't. Locking is purely sequential-by-position, not "all prior done".
    const items = [item("a"), item("b"), item("c")];
    const progress = new Map([
      [itemKey(item("b")), { status: "completed" as const, percent: 100 }],
    ]);
    expect(isPositionLocked(items, 2, progress)).toBe(false);
  });

  it("in_progress (not completed) on the prior item still counts as locked", () => {
    const items = [item("a"), item("b")];
    const progress = new Map([
      [itemKey(item("a")), { status: "in_progress" as const, percent: 80 }],
    ]);
    expect(isPositionLocked(items, 1, progress)).toBe(true);
  });
});
