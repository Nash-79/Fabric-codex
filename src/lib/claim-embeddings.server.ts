/**
 * Persist locally-computed claim embeddings (WP3.1 / defect D4).
 *
 * Why this exists as a server module rather than a script writing to Supabase directly:
 *
 * Embeddings are generated on the author's laptop by `scripts/generate-embeddings.mjs` with a
 * local Ollama model -- free, unmetered, and consistent with the repo's "LLM work happens on your
 * laptop, the server only runs deterministic work" operating model. But `claims` is read-only to
 * the anon key that agents use, and an RLS-blocked UPDATE in PostgREST returns *no error and no
 * rows*. The original script therefore reported thousands of successful writes while the database
 * stayed at zero embeddings. The service-role key that could write is server-only and managed by
 * Lovable Cloud, so it cannot simply be handed to the script.
 *
 * The split: the laptop computes vectors, the deployed server writes them. Vectors cross the
 * wire; no secret does.
 */

/**
 * Fixed by the `vector(N)` column type in
 * `supabase/migrations/20260824120000_fix_match_claims_hybrid_columns.sql`.
 * Postgres would reject a wrong-length vector anyway, but validating here produces a clear error
 * and prevents a partially-applied batch.
 */
export const CLAIM_EMBEDDING_DIM = 768;

/** Keeps a single request's payload to a few MB and bounds the per-request write loop. */
export const MAX_EMBEDDING_BATCH = 200;

export type ClaimEmbeddingInput = { claimId: string; embedding: number[] };

export type WriteClaimEmbeddingsResult = {
  written: number;
  /** Claim ids that matched no row -- reported, never silently counted as written. */
  missing: string[];
};

/**
 * Validate an entire batch before writing any of it, so one malformed vector cannot leave the
 * corpus half-embedded with no clear failure point.
 *
 * @throws if the model name is blank, the batch is empty/oversized, or any vector is the wrong
 * length or contains a non-finite value.
 */
export function assertValidEmbeddingBatch(model: string, items: ClaimEmbeddingInput[]): void {
  if (!model.trim()) throw new Error("An embedding model name is required.");
  if (!items.length) throw new Error("No embeddings supplied.");
  if (items.length > MAX_EMBEDDING_BATCH) {
    throw new Error(`Send at most ${MAX_EMBEDDING_BATCH} embeddings per request.`);
  }
  for (const item of items) {
    if (!item?.claimId) throw new Error("Every item needs a claimId.");
    if (!Array.isArray(item.embedding) || item.embedding.length !== CLAIM_EMBEDDING_DIM) {
      throw new Error(
        `Claim ${item.claimId}: expected a ${CLAIM_EMBEDDING_DIM}-dimension vector, got ` +
          `${Array.isArray(item.embedding) ? item.embedding.length : typeof item.embedding}.`,
      );
    }
    if (item.embedding.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
      throw new Error(`Claim ${item.claimId}: embedding contains a non-finite value.`);
    }
  }
}

/**
 * Write a validated batch with the service-role client.
 *
 * Each update uses `.select("id")` so a claim id that matches no row is reported in `missing`
 * rather than counted as a silent success -- that false-success mode is the entire reason this
 * code path exists.
 */
export async function writeClaimEmbeddingsCore(
  sb: any,
  model: string,
  items: ClaimEmbeddingInput[],
): Promise<WriteClaimEmbeddingsResult> {
  assertValidEmbeddingBatch(model, items);

  let written = 0;
  const missing: string[] = [];
  for (const item of items) {
    const { data: updated, error } = await sb
      .from("claims")
      .update({ embedding: item.embedding, embedding_model: model.trim() })
      .eq("id", item.claimId)
      .select("id");
    if (error) throw new Error(`Claim ${item.claimId}: ${error.message}`);
    if (!updated?.length) missing.push(item.claimId);
    else written++;
  }
  return { written, missing };
}
