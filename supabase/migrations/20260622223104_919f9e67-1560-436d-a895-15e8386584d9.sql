-- Ledger of every content-seed run
CREATE TABLE IF NOT EXISTS public.seed_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  trigger text NOT NULL DEFAULT 'manual',
  content_signature text,
  source_count integer NOT NULL DEFAULT 0,
  claim_count integer NOT NULL DEFAULT 0,
  blog_count integer NOT NULL DEFAULT 0,
  topic_count integer NOT NULL DEFAULT 0,
  diagram_count integer NOT NULL DEFAULT 0,
  skipped boolean NOT NULL DEFAULT false,
  duration_ms integer,
  error text
);

GRANT SELECT ON public.seed_runs TO anon, authenticated;
GRANT ALL ON public.seed_runs TO service_role;

ALTER TABLE public.seed_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seed_runs readable by all" ON public.seed_runs
  FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS seed_runs_ran_at_idx ON public.seed_runs (ran_at DESC);

-- GIN indexes powering search_atlas (idempotent)
CREATE INDEX IF NOT EXISTS claims_fts_idx
  ON public.claims USING GIN (to_tsvector('english', text));

CREATE INDEX IF NOT EXISTS blogs_fts_idx
  ON public.blogs USING GIN (
    to_tsvector('english', title || ' ' || coalesce(summary, '') || ' ' || coalesce(body_md, ''))
  );

CREATE INDEX IF NOT EXISTS sources_fts_idx
  ON public.sources USING GIN (
    to_tsvector('english', title || ' ' || coalesce(summary, ''))
  );

CREATE INDEX IF NOT EXISTS topics_fts_idx
  ON public.topics USING GIN (
    to_tsvector('english', name || ' ' || coalesce(description, ''))
  );