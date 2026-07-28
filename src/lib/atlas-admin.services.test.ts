import { describe, expect, it } from "vitest";
import { saveContentItemVersion } from "./atlas-admin.services.server";

// Minimal chainable/thenable Supabase stub, matching atlas-publish.services.test.ts's pattern:
// every query-builder method records the call and returns the builder; awaiting the builder (or
// .single()/.maybeSingle()) pops the next queued result for that table.
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

describe("saveContentItemVersion", () => {
  it("carries the prior version's presentation_profile/lesson_meta forward when the caller doesn't pass one", async () => {
    // Regression test for the bug this Settings edit path used to have: "Edit as new version"
    // never exposed presentation_profile/lesson_meta, so the new row silently landed with none —
    // discarding whatever a prior publish/retrofit had set.
    const { sb, ops } = makeStub({
      content_items: [
        {
          data: {
            id: "prior-id",
            version: 1,
            topic_slug: "onelake",
            presentation_profile: {
              archetype: "architecture",
              featured_diagram: "onelake-architecture",
            },
            lesson_meta: null,
          },
        }, // existingId lookup
        { data: null }, // archive update
        { data: { id: "new-id", version: 2 } }, // insert
      ],
    });
    await saveContentItemVersion(sb, {
      kind: "article",
      existingId: "prior-id",
      slug: "onelake",
      title: "OneLake",
      body_md: "Body",
      cited_source_ids: ["s1"],
    });
    const insert = opsFor(ops, "content_items", "insert")[0].args[0] as Record<string, unknown>;
    expect(insert.presentation_profile).toMatchObject({
      archetype: "architecture",
      featured_diagram: "onelake-architecture",
    });
    expect(insert.lesson_meta).toBeNull();
  });

  it("uses an explicitly passed presentation_profile instead of the prior one", async () => {
    const { sb, ops } = makeStub({
      content_items: [
        { data: { id: "prior-id", version: 1, presentation_profile: { archetype: "explainer" } } },
        { data: null },
        { data: { id: "new-id", version: 2 } },
      ],
    });
    await saveContentItemVersion(sb, {
      kind: "article",
      existingId: "prior-id",
      slug: "onelake",
      title: "OneLake",
      body_md: "Body",
      cited_source_ids: ["s1"],
      presentation_profile: { archetype: "deep-dive" },
    });
    const insert = opsFor(ops, "content_items", "insert")[0].args[0] as Record<string, unknown>;
    expect(insert.presentation_profile).toMatchObject({ archetype: "deep-dive" });
  });

  it("allows explicitly clearing a prior presentation_profile with null", async () => {
    const { sb, ops } = makeStub({
      content_items: [
        { data: { id: "prior-id", version: 1, presentation_profile: { archetype: "explainer" } } },
        { data: null },
        { data: { id: "new-id", version: 2 } },
      ],
    });
    await saveContentItemVersion(sb, {
      kind: "article",
      existingId: "prior-id",
      slug: "onelake",
      title: "OneLake",
      body_md: "Body",
      cited_source_ids: ["s1"],
      presentation_profile: null,
    });
    const insert = opsFor(ops, "content_items", "insert")[0].args[0] as Record<string, unknown>;
    expect(insert.presentation_profile).toBeNull();
  });

  it("rejects a malformed presentation_profile", async () => {
    const { sb } = makeStub({
      content_items: [{ data: null }],
    });
    await expect(
      saveContentItemVersion(sb, {
        kind: "article",
        slug: "x",
        title: "T",
        body_md: "B",
        cited_source_ids: ["s1"],
        presentation_profile: { archetype: "not-a-real-archetype" } as never,
      }),
    ).rejects.toThrow();
  });
});
