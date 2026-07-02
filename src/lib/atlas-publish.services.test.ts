import { describe, expect, it } from "vitest";
import { publishContentItem, publishDiagram, publishSource } from "./atlas-publish.services.server";

// Minimal chainable/thenable Supabase stub: every query-builder method records the call and
// returns the builder; awaiting the builder (or .single()/.maybeSingle()) pops the next queued
// result for that table. Services under test take `sb` as an argument, so no mocking framework
// is needed.
type Result = { data?: unknown; error?: { message: string } | null };
type Op = { table: string; method: string; args: unknown[] };

function makeStub(queues: Record<string, Result[]>) {
  const ops: Op[] = [];
  function from(table: string) {
    const next = () => queues[table]?.shift() ?? { data: null, error: null };
    const b: Record<string, unknown> = {};
    for (const m of [
      "select",
      "insert",
      "update",
      "upsert",
      "delete",
      "eq",
      "in",
      "order",
      "limit",
    ]) {
      b[m] = (...args: unknown[]) => {
        ops.push({ table, method: m, args });
        return b;
      };
    }
    b.single = () => Promise.resolve(next());
    b.maybeSingle = () => Promise.resolve(next());
    b.then = (onF: (r: Result) => unknown, onR: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(onF, onR);
    return b;
  }
  return { sb: { from }, ops };
}

const opsFor = (ops: Op[], table: string, method: string) =>
  ops.filter((o) => o.table === table && o.method === method);

describe("publishSource", () => {
  it("requires url and title", async () => {
    const { sb } = makeStub({});
    await expect(publishSource(sb, { url: "", title: "x" } as never)).rejects.toThrow(/url/i);
    await expect(publishSource(sb, { url: "https://a", title: " " } as never)).rejects.toThrow(
      /title/i,
    );
  });

  it("drops claims tagged to unknown capabilities and keeps valid ones pending", async () => {
    const { sb, ops } = makeStub({
      capabilities: [{ data: [{ id: "onelake" }] }],
      sources: [{ data: { id: "src-1" } }],
      claims: [{ data: [] }, { data: null }],
    });
    const result = await publishSource(sb, {
      url: "https://learn.microsoft.com/fabric/onelake-overview",
      title: "OneLake overview",
      claims: [
        { capability_id: "onelake", text: "OneLake is the single lake." },
        { capability_id: "not-a-capability", text: "dropped" },
      ],
    });
    expect(result.slug).toBe("onelake-overview"); // derived from the URL tail
    expect(result.claimsInserted).toBe(1);
    expect(result.droppedClaims).toHaveLength(1);
    const inserted = opsFor(ops, "claims", "insert")[0].args[0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      capability_id: "onelake",
      status: "pending",
      active: true,
      depth: 2,
      type: "fact",
    });
  });
});

describe("publishContentItem", () => {
  it("refuses to publish without cited sources", async () => {
    const { sb } = makeStub({});
    await expect(
      publishContentItem(sb, {
        kind: "article",
        slug: "x",
        title: "T",
        body_md: "B",
        cited_source_keys: [],
      }),
    ).rejects.toThrow(/cited_source_keys/);
  });

  it("reports cited source keys that are not approved", async () => {
    const { sb } = makeStub({ sources: [{ data: [{ id: "s1", slug: "known" }] }] });
    await expect(
      publishContentItem(sb, {
        kind: "article",
        slug: "x",
        title: "T",
        body_md: "B",
        cited_source_keys: ["known", "missing-one"],
      }),
    ).rejects.toThrow(/missing-one/);
  });

  it("versions instead of overwriting: archives the prior row and links supersedes_id", async () => {
    const { sb, ops } = makeStub({
      sources: [{ data: [{ id: "s1", slug: "src-a" }] }],
      content_items: [
        { data: { id: "prior-id", version: 1, topic_slug: "onelake" } }, // active prior
        { data: null }, // archive update
        { data: { id: "new-id", version: 2 } }, // insert
      ],
      content_item_sources: [{ data: null }],
    });
    const result = await publishContentItem(sb, {
      kind: "article",
      slug: "onelake-deep-dive",
      title: "OneLake deep dive",
      body_md: "Body [S1]",
      cited_source_keys: ["src-a"],
    });

    expect(result.version).toBe(2);
    const archive = opsFor(ops, "content_items", "update")[0].args[0] as Record<string, unknown>;
    expect(archive).toMatchObject({
      active: false,
      status: "superseded",
      slug: "onelake-deep-dive@v1",
    });
    const insert = opsFor(ops, "content_items", "insert")[0].args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({
      version: 2,
      supersedes_id: "prior-id",
      active: true,
      topic_slug: "onelake", // inherited from the prior version
    });
    const cites = opsFor(ops, "content_item_sources", "insert")[0].args[0] as Array<
      Record<string, unknown>
    >;
    expect(cites).toEqual([
      expect.objectContaining({ content_item_id: "new-id", label: "S1", position: 0 }),
    ]);
  });
});

describe("publishDiagram", () => {
  it("registers a manifest array by slug with the served /diagrams path", async () => {
    const { sb, ops } = makeStub({ diagrams: [{ data: null }] });
    const result = await publishDiagram(sb, [
      { path: "content/diagrams/onelake-architecture.svg", caption: "OneLake" },
      { slug: "direct-lake-internals", kind: "internals" },
    ]);
    expect(result.registered).toBe(2);
    const rows = opsFor(ops, "diagrams", "upsert")[0].args[0] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      slug: "onelake-architecture",
      path: "/diagrams/onelake-architecture.svg",
      kind: "architecture",
    });
    expect(rows[1]).toMatchObject({ slug: "direct-lake-internals", kind: "internals" });
  });

  it("rejects an empty manifest", async () => {
    const { sb } = makeStub({});
    await expect(publishDiagram(sb, [])).rejects.toThrow(/No diagram entries/);
  });
});
