-- WP3.1 fix: match_claims_hybrid was authored against a schema that does not exist.
--
-- The original 20260824000000 migration referenced five columns that are not on public.claims:
--   claim_text -> text, depth_level -> depth, confidence_score -> confidence,
--   claim_id and topic_slug -> no equivalent (claim_id/topic_slug live on other tables).
-- Every call therefore failed at runtime with "column c.claim_text does not exist". The advisor
-- caught the error and fell back to lexical ILIKE search, so nothing was user-visibly broken --
-- but hybrid retrieval never actually ran, leaving defect D4 open despite WP3.1 being ticked.
--
-- Also fixes a scoring bug: with query_embedding NULL the vector CTE still returned match_count*2
-- rows in arbitrary order (`c.embedding <=> NULL` is NULL for every row, so ORDER BY is a no-op),
-- injecting meaningless ranks into the RRF fusion and diluting the genuine text ranking. The
-- vector arm is now skipped entirely unless an embedding is supplied, which is the correct
-- behaviour while the corpus has zero embeddings -- it degrades to pure full-text, not to noise.

-- Embedding dimension: the original migration declared vector(1024) for mxbai-embed-large, but
-- the model actually in use locally is nomic-embed-text at 768 dims. Since no embeddings had ever
-- been written (0 of 3052 claims), re-typing the column is a free correction rather than a
-- migration of existing data. The HNSW indexes must be dropped first -- an index cannot survive a
-- change to its column's type.
DROP INDEX IF EXISTS public.claims_embedding_idx;
DROP INDEX IF EXISTS public.content_items_embedding_idx;

ALTER TABLE public.claims        ALTER COLUMN embedding TYPE vector(768) USING NULL;
ALTER TABLE public.content_items ALTER COLUMN embedding TYPE vector(768) USING NULL;

CREATE INDEX IF NOT EXISTS claims_embedding_idx ON public.claims
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS content_items_embedding_idx ON public.content_items
  USING hnsw (embedding vector_cosine_ops);

DROP FUNCTION IF EXISTS public.match_claims_hybrid(text, vector, int, text, int);

CREATE OR REPLACE FUNCTION public.match_claims_hybrid(
  query_text text,
  query_embedding vector(768) DEFAULT NULL,
  match_count int DEFAULT 40,
  capability_filter text DEFAULT NULL,
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  capability_id text,
  claim_text text,
  depth int,
  confidence double precision,
  source_id uuid,
  rrf_score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH vector_ranked AS (
    SELECT
      c.id AS cid,
      ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding ASC) AS v_rank
    FROM public.claims c
    WHERE c.active = true
      -- Skip the vector arm entirely when no embedding is supplied, rather than emitting
      -- arbitrarily-ordered rows into the fusion.
      AND query_embedding IS NOT NULL
      AND c.embedding IS NOT NULL
      AND (capability_filter IS NULL OR c.capability_id = capability_filter)
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT match_count * 2
  ),
  text_ranked AS (
    SELECT
      c.id AS cid,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(to_tsvector('english', c.text), plainto_tsquery('english', query_text)) DESC
      ) AS t_rank
    FROM public.claims c
    WHERE c.active = true
      AND query_text IS NOT NULL
      AND query_text <> ''
      AND to_tsvector('english', c.text) @@ plainto_tsquery('english', query_text)
      AND (capability_filter IS NULL OR c.capability_id = capability_filter)
    ORDER BY ts_rank_cd(to_tsvector('english', c.text), plainto_tsquery('english', query_text)) DESC
    LIMIT match_count * 2
  ),
  combined_scores AS (
    SELECT
      COALESCE(v.cid, t.cid) AS claim_row_id,
      (
        COALESCE(1.0 / (rrf_k + v.v_rank), 0.0) +
        COALESCE(1.0 / (rrf_k + t.t_rank), 0.0)
      ) AS final_rrf_score
    FROM vector_ranked v
    FULL OUTER JOIN text_ranked t ON v.cid = t.cid
  )
  SELECT
    c.id,
    c.capability_id,
    c.text AS claim_text,
    c.depth,
    c.confidence::double precision,
    c.source_id,
    cs.final_rrf_score::double precision AS rrf_score
  FROM combined_scores cs
  JOIN public.claims c ON cs.claim_row_id = c.id
  WHERE c.active = true
  ORDER BY cs.final_rrf_score DESC
  LIMIT match_count;
END;
$$;

-- Read-only retrieval helper: same exposure as the existing search_atlas RPC.
GRANT EXECUTE ON FUNCTION public.match_claims_hybrid(text, vector, int, text, int) TO anon, authenticated;

-- Supports the text arm; without it every hybrid call sequentially scans claims.
CREATE INDEX IF NOT EXISTS claims_text_fts_idx
  ON public.claims USING gin (to_tsvector('english', text));
