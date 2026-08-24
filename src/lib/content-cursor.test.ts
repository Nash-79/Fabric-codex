import { describe, expect, it } from "vitest";
import {
  buildContentPage,
  encodeContentCursor,
  parseContentCursor,
  type ContentCursor,
} from "./content-cursor";

function row(id: string, updated_at: string | null = "2026-08-01T00:00:00Z") {
  return { id, updated_at };
}

describe("content cursor encoding", () => {
  it("round-trips a keyset cursor", () => {
    const cursor: ContentCursor = { updatedAt: "2026-08-01T00:00:00Z", id: "abc-123" };
    expect(parseContentCursor(encodeContentCursor(cursor))).toEqual(cursor);
  });

  it("round-trips an offset cursor", () => {
    expect(parseContentCursor(encodeContentCursor({ offset: 48 }))).toEqual({ offset: 48 });
  });

  it("produces a URL-safe token (no +, / or = padding)", () => {
    const token = encodeContentCursor({
      updatedAt: "2026-08-01T12:34:56.789Z",
      id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    });
    expect(token).not.toMatch(/[+/=]/);
  });

  it("treats absent, malformed and structurally wrong tokens as 'start from the beginning'", () => {
    expect(parseContentCursor(undefined)).toBeNull();
    expect(parseContentCursor(null)).toBeNull();
    expect(parseContentCursor("")).toBeNull();
    expect(parseContentCursor("not-base64-$$$")).toBeNull();
    expect(parseContentCursor(encodeContentCursor({ offset: -1 } as ContentCursor))).toBeNull();
    expect(parseContentCursor(toToken({ offset: 1.5 }))).toBeNull();
    expect(parseContentCursor(toToken({ updatedAt: "x" }))).toBeNull(); // id missing
    expect(parseContentCursor(toToken({ id: "x" }))).toBeNull(); // updatedAt missing
    expect(parseContentCursor(toToken(["not", "an", "object"]))).toBeNull();
    expect(parseContentCursor(toToken(null))).toBeNull();
  });
});

function toToken(value: unknown) {
  return encodeContentCursor(value as ContentCursor);
}

describe("buildContentPage", () => {
  it("returns a null cursor on a short read (last page)", () => {
    const page = buildContentPage([row("a"), row("b")], 5);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("returns a null cursor on an exactly-full read", () => {
    // pageSize + 1 rows are fetched, so exactly pageSize back means there is no further row.
    const page = buildContentPage([row("a"), row("b")], 2);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("trims the over-fetched row and points the cursor at the last kept row", () => {
    const rows = [row("a", "2026-08-03T00:00:00Z"), row("b", "2026-08-02T00:00:00Z"), row("c")];
    const page = buildContentPage(rows, 2);
    expect(page.items.map((r) => r.id)).toEqual(["a", "b"]);
    expect(parseContentCursor(page.nextCursor)).toEqual({
      updatedAt: "2026-08-02T00:00:00Z",
      id: "b",
    });
  });

  it("does not emit a cursor when the boundary row has no timestamp to key on", () => {
    // Better to end paging than to hand back a cursor that would silently restart the list.
    const page = buildContentPage([row("a", null), row("b")], 1);
    expect(page.items.map((r) => r.id)).toEqual(["a"]);
    expect(page.nextCursor).toBeNull();
  });

  it("walks a corpus exactly once with no duplicates or gaps across pages", () => {
    // The regression this guards: rows sharing an updated_at instant (one publish run) must not
    // repeat or vanish at a page boundary -- that is what the id tiebreaker exists for.
    const all = [
      row("i9", "2026-08-09T00:00:00Z"),
      row("i8", "2026-08-08T00:00:00Z"),
      row("i7", "2026-08-08T00:00:00Z"),
      row("i6", "2026-08-08T00:00:00Z"),
      row("i5", "2026-08-05T00:00:00Z"),
      row("i4", "2026-08-04T00:00:00Z"),
      row("i3", "2026-08-03T00:00:00Z"),
      row("i2", "2026-08-02T00:00:00Z"),
      row("i1", "2026-08-01T00:00:00Z"),
    ];
    // Mirrors the server's keyset predicate: strictly older, or same instant with a smaller id.
    const after = (c: ContentCursor | null) =>
      !c || c.updatedAt === undefined
        ? all
        : all.filter(
            (r) => r.updated_at! < c.updatedAt! || (r.updated_at === c.updatedAt && r.id < c.id!),
          );

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const page: { items: ReturnType<typeof row>[]; nextCursor: string | null } = buildContentPage(
        after(parseContentCursor(cursor)).slice(0, 3),
        2,
      );
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(all.map((r) => r.id));
    expect(new Set(seen).size).toBe(all.length);
  });
});
