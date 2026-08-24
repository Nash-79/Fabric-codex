import { describe, expect, it } from "vitest";
import {
  CLAIM_EMBEDDING_DIM,
  MAX_EMBEDDING_BATCH,
  assertValidEmbeddingBatch,
  writeClaimEmbeddingsCore,
} from "./claim-embeddings.server";

const vec = (fill = 0.1) => Array.from({ length: CLAIM_EMBEDDING_DIM }, () => fill);

/** Minimal Supabase-shaped stub: `.update().eq().select()` resolves to `{ data, error }`. */
function stubClient(
  resolve: (claimId: string) => { data?: unknown[]; error?: { message: string } },
) {
  const updates: { claimId: string; payload: any }[] = [];
  const client = {
    from: () => ({
      update: (payload: any) => ({
        eq: (_col: string, claimId: string) => ({
          select: () => {
            updates.push({ claimId, payload });
            return Promise.resolve(resolve(claimId));
          },
        }),
      }),
    }),
  };
  return { client, updates };
}

describe("assertValidEmbeddingBatch", () => {
  it("accepts a well-formed batch", () => {
    expect(() =>
      assertValidEmbeddingBatch("nomic-embed-text", [{ claimId: "a", embedding: vec() }]),
    ).not.toThrow();
  });

  it("rejects a blank model name", () => {
    expect(() => assertValidEmbeddingBatch("  ", [{ claimId: "a", embedding: vec() }])).toThrow(
      /model name is required/i,
    );
  });

  it("rejects an empty batch", () => {
    expect(() => assertValidEmbeddingBatch("m", [])).toThrow(/No embeddings supplied/i);
  });

  it("rejects an oversized batch", () => {
    const items = Array.from({ length: MAX_EMBEDDING_BATCH + 1 }, (_, i) => ({
      claimId: `c${i}`,
      embedding: vec(),
    }));
    expect(() => assertValidEmbeddingBatch("m", items)).toThrow(/at most/i);
  });

  it("rejects a wrong-dimension vector, naming the claim and both sizes", () => {
    expect(() =>
      assertValidEmbeddingBatch("m", [{ claimId: "bad", embedding: Array(1024).fill(0.1) }]),
    ).toThrow(/bad.*768.*1024/s);
  });

  it("rejects non-finite values, which would corrupt cosine distance silently", () => {
    const bad = vec();
    bad[5] = Number.NaN;
    expect(() => assertValidEmbeddingBatch("m", [{ claimId: "x", embedding: bad }])).toThrow(
      /non-finite/i,
    );
  });

  it("rejects an item with no claimId", () => {
    expect(() => assertValidEmbeddingBatch("m", [{ claimId: "", embedding: vec() }])).toThrow(
      /needs a claimId/i,
    );
  });

  it("validates the whole batch before writing any of it", async () => {
    // The second item is malformed; nothing at all should be written.
    const { client, updates } = stubClient(() => ({ data: [{ id: "ok" }] }));
    await expect(
      writeClaimEmbeddingsCore(client, "m", [
        { claimId: "a", embedding: vec() },
        { claimId: "b", embedding: [0.1] },
      ]),
    ).rejects.toThrow(/dimension/i);
    expect(updates).toHaveLength(0);
  });
});

describe("writeClaimEmbeddingsCore", () => {
  it("counts written rows and records the model", async () => {
    const { client, updates } = stubClient(() => ({ data: [{ id: "x" }] }));
    const result = await writeClaimEmbeddingsCore(client, " nomic-embed-text ", [
      { claimId: "a", embedding: vec() },
      { claimId: "b", embedding: vec() },
    ]);
    expect(result).toEqual({ written: 2, missing: [] });
    expect(updates.map((u) => u.payload.embedding_model)).toEqual([
      "nomic-embed-text",
      "nomic-embed-text",
    ]);
  });

  it("reports ids that matched no row instead of counting them as written", async () => {
    // This is the regression that matters: an RLS-blocked or non-existent row returns no error
    // and no rows. Counting that as success is exactly how the original backfill reported
    // thousands of writes against an empty database.
    const { client } = stubClient((claimId) =>
      claimId === "ghost" ? { data: [] } : { data: [{ id: claimId }] },
    );
    const result = await writeClaimEmbeddingsCore(client, "m", [
      { claimId: "real", embedding: vec() },
      { claimId: "ghost", embedding: vec() },
    ]);
    expect(result.written).toBe(1);
    expect(result.missing).toEqual(["ghost"]);
  });

  it("surfaces a driver error with the offending claim id", async () => {
    const { client } = stubClient(() => ({ error: { message: "vector dim mismatch" } }));
    await expect(
      writeClaimEmbeddingsCore(client, "m", [{ claimId: "c1", embedding: vec() }]),
    ).rejects.toThrow(/c1: vector dim mismatch/);
  });
});
