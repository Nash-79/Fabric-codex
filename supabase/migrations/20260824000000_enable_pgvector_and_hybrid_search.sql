-- WP3.1: Enable pgvector and add embedding columns and hybrid search RPC
-- Adds vector(1024) to claims and content_items with HNSW indexing
-- Creates match_claims_hybrid RPC implementing Reciprocal Rank Fusion (RRF) between semantic cosine similarity and tsvector full-text search

CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding columns
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS embedding_model text;

ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS embedding vector(1024);
ALTER TABLE public.content_items ADD COLUMN IF NOT EXISTS embedding_model text;

-- HNSW vector cosine indexes
CREATE INDEX IF NOT EXISTS claims_embedding_idx ON public.claims
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS content_items_embedding_idx ON public.content_items
  USING hnsw (embedding vector_cosine_ops);

-- Hybrid search RPC function using Reciprocal Rank Fusion (RRF)
CREATE OR REPLACE FUNCTION public.match_claims_hybrid(
  query_text text,
  query_embedding vector(1024) DEFAULT NULL,
  match_count int DEFAULT 40,
  capability_filter text DEFAULT NULL,
  rrf_k int DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  claim_id text,
  capability_id text,
  topic_slug text,
  claim_text text,
  depth_level int,
  confidence_score float8,
  source_id uuid,
  rrf_score float8
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH vector_ranked AS (
    SELECT
      c.id,
      ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding ASC) as v_rank
    FROM public.claims c
    WHERE c.active = true
      AND (query_embedding IS NULL OR c.embedding IS NOT NULL)
      AND (capability_filter IS NULL OR c.capability_id = capability_filter)
    ORDER BY c.embedding <=> query_embedding ASC
    LIMIT match_count * 2
  ),
  text_ranked AS (
    SELECT
      c.id,
      ROW_NUMBER() OVER (
        ORDER BY ts_rank_cd(to_tsvector('english', c.claim_text), plainto_tsquery('english', query_text)) DESC
      ) as t_rank
    FROM public.claims c
    WHERE c.active = true
      AND (query_text IS NULL OR query_text = '' OR to_tsvector('english', c.claim_text) @@ plainto_tsquery('english', query_text))
      AND (capability_filter IS NULL OR c.capability_id = capability_filter)
    ORDER BY ts_rank_cd(to_tsvector('english', c.claim_text), plainto_tsquery('english', query_text)) DESC
    LIMIT match_count * 2
  ),
  combined_scores AS (
    SELECT
      COALESCE(v.id, t.id) as claim_row_id,
      (
        COALESCE(1.0 / (rrf_k + v.v_rank), 0.0) +
        COALESCE(1.0 / (rrf_k + t.t_rank), 0.0)
      ) as final_rrf_score
    FROM vector_ranked v
    FULL OUTER JOIN text_ranked t ON v.id = t.id
  )
  SELECT
    c.id,
    c.claim_id,
    c.capability_id,
    c.topic_slug,
    c.claim_text,
    c.depth_level,
    c.confidence_score,
    c.source_id,
    cs.final_rrf_score::float8 as rrf_score
  FROM combined_scores cs
  JOIN public.claims c ON cs.claim_row_id = c.id
  WHERE c.active = true
  ORDER BY cs.final_rrf_score DESC
  LIMIT match_count;
END;
$$;

