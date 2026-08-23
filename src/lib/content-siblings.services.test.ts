import { describe, expect, it } from "vitest";
import { resolveContentSiblings, resolveGoverningPath } from "./content-siblings.services.server";

// Same chainable/thenable Supabase stub pattern as atlas-publish.services.test.ts: services take
// `sb` as an argument, so no mocking framework is needed.
type Result = { data?: unknown; error?: { message: string } | null };

function makeStub(queues: Record<string, Result[]>) {
  function from(table: string) {
    const next = () => queues[table]?.shift() ?? { data: null, error: null };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order"]) {
      b[m] = (..._args: unknown[]) => b;
    }
    b.maybeSingle = () => Promise.resolve(next());
    b.then = (onF: (r: Result) => unknown, onR: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(onF, onR);
    return b;
  }
  return { from };
}

describe("resolveGoverningPath", () => {
  it("uses the requested path slug without querying", async () => {
    const sb = makeStub({});
    const result = await resolveGoverningPath(sb, "lesson", "spark-beginner", "spark-track");
    expect(result).toBe("spark-track");
  });

  it("auto-detects a single membership", async () => {
    const sb = makeStub({
      path_items: [{ data: [{ path_slug: "spark-track" }] }],
    });
    const result = await resolveGoverningPath(sb, "lesson", "spark-beginner", undefined);
    expect(result).toBe("spark-track");
  });

  it("returns null when the item is in zero paths", async () => {
    const sb = makeStub({ path_items: [{ data: [] }] });
    const result = await resolveGoverningPath(sb, "article", "orphan-article", undefined);
    expect(result).toBeNull();
  });

  it("returns null when the item is in 2+ paths (ambiguous)", async () => {
    const sb = makeStub({
      path_items: [{ data: [{ path_slug: "spark-track" }, { path_slug: "warehouse-track" }] }],
    });
    const result = await resolveGoverningPath(sb, "lesson", "spark-beginner", undefined);
    expect(result).toBeNull();
  });
});

describe("resolveContentSiblings", () => {
  it("orders by path position, not recency, when the item is in a path", async () => {
    const sb = makeStub({
      path_items: [
        { data: [{ path_slug: "spark-track" }] }, // resolveGoverningPath lookup
        {
          data: [
            { content_kind: "lesson", content_slug: "spark-beginner", position: 1 },
            { content_kind: "lesson", content_slug: "spark-intermediate", position: 2 },
            { content_kind: "lesson", content_slug: "spark-expert", position: 3 },
          ],
        },
      ],
      learning_paths: [{ data: { title: "Spark Track" } }],
      content_items: [
        {
          data: [
            { slug: "spark-beginner", title: "Spark: Beginner" },
            { slug: "spark-expert", title: "Spark: Expert" },
          ],
        },
      ],
    });

    const result = await resolveContentSiblings(sb, "lesson", "spark-intermediate", undefined);

    expect(result.pathSlug).toBe("spark-track");
    expect(result.pathTitle).toBe("Spark Track");
    expect(result.prev).toEqual({ slug: "spark-beginner", title: "Spark: Beginner" });
    expect(result.next).toEqual({ slug: "spark-expert", title: "Spark: Expert" });
  });

  // D1 regression test (docs/plan/phase-1-curriculum.md WP1.1 gate): editing an old article's
  // updated_at must NOT reorder the sequence for an item that's in a path. The old
  // `.order("updated_at", { ascending: false })` behavior only kicks in as a fallback once
  // resolveGoverningPath finds no path — this test proves the path branch never looks at
  // updated_at at all, by never supplying it in the stubbed content_items rows and still getting
  // the correct path-order result.
  it("D1 regression: path order is stable regardless of updated_at — the path branch never reads it", async () => {
    const sb = makeStub({
      path_items: [
        { data: [{ path_slug: "spark-track" }] },
        {
          data: [
            { content_kind: "lesson", content_slug: "spark-beginner", position: 1 },
            { content_kind: "lesson", content_slug: "spark-intermediate", position: 2 },
            { content_kind: "lesson", content_slug: "spark-expert", position: 3 },
          ],
        },
      ],
      learning_paths: [{ data: { title: "Spark Track" } }],
      // Note: no `updated_at` column at all in this select — if the path branch depended on
      // recency it would have nothing to sort by. The result below can only be correct if
      // ordering came from path_items.position.
      content_items: [
        {
          data: [
            { slug: "spark-intermediate", title: "Spark: Intermediate" },
            { slug: "spark-expert", title: "Spark: Expert" },
          ],
        },
      ],
    });

    const result = await resolveContentSiblings(sb, "lesson", "spark-beginner", undefined);

    expect(result.pathSlug).toBe("spark-track");
    expect(result.prev).toBeNull();
    expect(result.next).toEqual({ slug: "spark-intermediate", title: "Spark: Intermediate" });
  });

  it("falls back to recency ordering when the item is in no path", async () => {
    const sb = makeStub({
      path_items: [{ data: [] }],
      content_items: [
        {
          data: [
            { slug: "newest", title: "Newest" },
            { slug: "middle", title: "Middle" },
            { slug: "oldest", title: "Oldest" },
          ],
        },
      ],
    });

    const result = await resolveContentSiblings(sb, "article", "middle", undefined);

    expect(result.pathSlug).toBeNull();
    expect(result.pathTitle).toBeNull();
    expect(result.prev).toEqual({ slug: "newest", title: "Newest" });
    expect(result.next).toEqual({ slug: "oldest", title: "Oldest" });
  });

  it("falls back to recency ordering when a requested ?path is stale (item not actually in it)", async () => {
    const sb = makeStub({
      path_items: [
        { data: [{ content_kind: "article", content_slug: "other-item", position: 1 }] },
      ],
      content_items: [
        {
          data: [
            { slug: "middle", title: "Middle" },
            { slug: "oldest", title: "Oldest" },
          ],
        },
      ],
    });

    const result = await resolveContentSiblings(sb, "article", "middle", "stale-path");

    expect(result.pathSlug).toBeNull();
    expect(result.next).toEqual({ slug: "oldest", title: "Oldest" });
  });

  it("returns nulls when the item isn't found anywhere", async () => {
    const sb = makeStub({
      path_items: [{ data: [] }],
      content_items: [{ data: [] }],
    });

    const result = await resolveContentSiblings(sb, "article", "missing", undefined);

    expect(result).toEqual({ pathSlug: null, pathTitle: null, prev: null, next: null });
  });
});
