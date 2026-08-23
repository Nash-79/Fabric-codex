import { describe, expect, it } from "vitest";
import {
  isRegression,
  mergeLocalRows,
  mergeRow,
  type ProgressRow,
} from "./progress.services.server";

describe("isRegression", () => {
  it("is not a regression when there is no existing row semantics — higher percent, same status", () => {
    expect(
      isRegression(
        { status: "in_progress", percent: 20, completed_at: null },
        { status: "in_progress", percent: 50 },
      ),
    ).toBe(false);
  });

  it("is a regression when the incoming percent is lower, same status", () => {
    expect(
      isRegression(
        { status: "in_progress", percent: 50, completed_at: null },
        { status: "in_progress", percent: 20 },
      ),
    ).toBe(true);
  });

  // The plan's explicit rule: "Never let the server downgrade a local completion — that reads as
  // data loss." A completed row can never be un-completed by an in_progress write, regardless of
  // percent, since a lower percent for an in_progress write is a perfectly normal thing (e.g. a
  // duplicate scroll-tick write racing an earlier one).
  it("is a regression to move a completed row back to in_progress, even at 100%", () => {
    expect(
      isRegression(
        { status: "completed", percent: 100, completed_at: "2026-01-01T00:00:00Z" },
        { status: "in_progress", percent: 100 },
      ),
    ).toBe(true);
  });

  it("is not a regression to move in_progress to completed", () => {
    expect(
      isRegression(
        { status: "in_progress", percent: 90, completed_at: null },
        { status: "completed", percent: 100 },
      ),
    ).toBe(false);
  });

  it("is not a regression when both are completed", () => {
    expect(
      isRegression(
        { status: "completed", percent: 100, completed_at: "2026-01-01T00:00:00Z" },
        { status: "completed", percent: 100 },
      ),
    ).toBe(false);
  });
});

describe("mergeRow", () => {
  const nowIso = "2026-08-23T00:00:00.000Z";

  it("takes the local row as-is when there is no existing server row", () => {
    const local: ProgressRow = {
      content_kind: "lesson",
      content_slug: "spark-beginner",
      status: "completed",
      percent: 100,
      completed_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const merged = mergeRow(local, undefined, nowIso);
    expect(merged.status).toBe("completed");
    expect(merged.percent).toBe(100);
    expect(merged.updated_at).toBe(nowIso);
  });

  it("union: a slug completed on EITHER side ends up completed", () => {
    const local: ProgressRow = {
      content_kind: "lesson",
      content_slug: "spark-beginner",
      status: "in_progress",
      percent: 40,
      completed_at: null,
      updated_at: "2026-01-01T00:00:00Z",
    };
    const server = {
      status: "completed" as const,
      percent: 100,
      completed_at: "2025-06-01T00:00:00Z",
    };
    const merged = mergeRow(local, server, nowIso);
    expect(merged.status).toBe("completed");
  });

  it("max: percent takes the higher of the two", () => {
    const local: ProgressRow = {
      content_kind: "article",
      content_slug: "onelake",
      status: "in_progress",
      percent: 80,
      completed_at: null,
      updated_at: "2026-01-01T00:00:00Z",
    };
    const server = { status: "in_progress" as const, percent: 35, completed_at: null };
    const merged = mergeRow(local, server, nowIso);
    expect(merged.percent).toBe(80);

    const merged2 = mergeRow({ ...local, percent: 10 }, { ...server, percent: 90 }, nowIso);
    expect(merged2.percent).toBe(90);
  });

  it("completed_at: takes the earliest non-null of the two", () => {
    const local: ProgressRow = {
      content_kind: "lesson",
      content_slug: "spark-beginner",
      status: "completed",
      percent: 100,
      completed_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const server = {
      status: "completed" as const,
      percent: 100,
      completed_at: "2026-01-01T00:00:00Z",
    };
    const merged = mergeRow(local, server, nowIso);
    expect(merged.completed_at).toBe("2026-01-01T00:00:00Z");
  });

  it("completed_at is null when neither side has one", () => {
    const local: ProgressRow = {
      content_kind: "article",
      content_slug: "onelake",
      status: "in_progress",
      percent: 30,
      completed_at: null,
      updated_at: "2026-01-01T00:00:00Z",
    };
    const server = { status: "in_progress" as const, percent: 10, completed_at: null };
    const merged = mergeRow(local, server, nowIso);
    expect(merged.completed_at).toBeNull();
  });

  // Regression guard for the merge path specifically: even though mergeLocalRows always applies
  // (it's a merge, not a conditional write), the union+max semantics themselves must never let a
  // thinner local device erase a fuller server completion. This is the "never downgrade" rule
  // expressed as a merge property rather than a rejection.
  it("never regresses the server side: a thin local device can't un-complete a server-completed row", () => {
    const local: ProgressRow = {
      content_kind: "lesson",
      content_slug: "spark-beginner",
      status: "in_progress",
      percent: 15,
      completed_at: null,
      updated_at: "2020-01-01T00:00:00Z", // stale device, hasn't synced in years
    };
    const server = {
      status: "completed" as const,
      percent: 100,
      completed_at: "2026-01-01T00:00:00Z",
    };
    const merged = mergeRow(local, server, nowIso);
    expect(merged.status).toBe("completed");
    expect(merged.percent).toBe(100);
  });
});

describe("mergeLocalRows", () => {
  it("merges each row independently by (kind, slug) key", () => {
    const rows: ProgressRow[] = [
      {
        content_kind: "lesson",
        content_slug: "spark-beginner",
        status: "completed",
        percent: 100,
        completed_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        content_kind: "article",
        content_slug: "onelake",
        status: "in_progress",
        percent: 60,
        completed_at: null,
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    const existing = new Map([
      ["article:onelake", { status: "in_progress" as const, percent: 20, completed_at: null }],
    ]);
    const merged = mergeLocalRows(rows, existing, "2026-08-23T00:00:00.000Z");

    expect(merged).toHaveLength(2);
    const lesson = merged.find((r) => r.content_slug === "spark-beginner")!;
    const article = merged.find((r) => r.content_slug === "onelake")!;
    expect(lesson.status).toBe("completed");
    expect(article.percent).toBe(60);
  });

  it("returns an empty array for an empty input", () => {
    expect(mergeLocalRows([], new Map(), "2026-08-23T00:00:00.000Z")).toEqual([]);
  });
});
