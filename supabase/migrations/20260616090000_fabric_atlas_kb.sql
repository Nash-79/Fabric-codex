-- Fabric Atlas knowledge-base schema.
--
-- Mirrors backend/app/models.py so SQLModel runs against Supabase Postgres with NO
-- model changes. Table names are the SQLModel defaults (lowercase class name); columns
-- are the model fields verbatim. PKs are TEXT because the app generates 12-char hex ids
-- in Python (_uid()) — do NOT switch to uuid/gen_random_uuid, it would break round-tripping.
-- *_json columns stay TEXT: the app reads/writes them as JSON strings (json.dumps/loads).
--
-- Idempotent: CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE POLICY.
-- Safe to re-run; safe to apply alongside the existing profiles/domains migrations.
--
-- RLS model: the FastAPI backend connects with the service_role key (bypasses RLS and
-- owns all writes + the versioning/validation invariants). anon/authenticated get
-- read-only SELECT on the public KB surface so the portal and advisor can read directly.

-- ============================================================ source
CREATE TABLE IF NOT EXISTS public.source (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 1,
  url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  tier INT NOT NULL DEFAULT 6,
  summary TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  why_it_matters TEXT NOT NULL DEFAULT '',
  takeaways_json TEXT NOT NULL DEFAULT '[]',
  content_hash TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS source_source_key_idx ON public.source(source_key);

-- ============================================================ claim
CREATE TABLE IF NOT EXISTS public.claim (
  id TEXT PRIMARY KEY,
  claim_key TEXT NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 1,
  capability_id TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  depth INT NOT NULL DEFAULT 1,
  type TEXT NOT NULL DEFAULT 'fact',
  -- pending | verified | rejected | superseded | deprecated | duplicate
  status TEXT NOT NULL DEFAULT 'pending',
  source_id TEXT NOT NULL DEFAULT '',
  supersedes_id TEXT,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  tags_json TEXT NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claim_claim_key_idx ON public.claim(claim_key);
CREATE INDEX IF NOT EXISTS claim_capability_id_idx ON public.claim(capability_id);
CREATE INDEX IF NOT EXISTS claim_status_idx ON public.claim(status);
CREATE INDEX IF NOT EXISTS claim_source_id_idx ON public.claim(source_id);
CREATE INDEX IF NOT EXISTS claim_active_idx ON public.claim(active);

-- ============================================================ asset
CREATE TABLE IF NOT EXISTS public.asset (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'generated',     -- referenced | generated
  url TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT 'image/svg+xml',
  caption TEXT NOT NULL DEFAULT '',
  attribution TEXT NOT NULL DEFAULT '',
  license_note TEXT NOT NULL DEFAULT '',
  capability_id TEXT NOT NULL DEFAULT '',
  source_id TEXT,
  claim_id TEXT,
  design_id TEXT,
  blog_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS asset_source_id_idx ON public.asset(source_id);
CREATE INDEX IF NOT EXISTS asset_design_id_idx ON public.asset(design_id);
CREATE INDEX IF NOT EXISTS asset_blog_id_idx ON public.asset(blog_id);

-- ============================================================ design
CREATE TABLE IF NOT EXISTS public.design (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  scenario TEXT NOT NULL DEFAULT '',
  constraints_json TEXT NOT NULL DEFAULT '{}',
  output_md TEXT NOT NULL DEFAULT '',
  cited_source_ids_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  -- draft | checked | validated | needs_review
  status TEXT NOT NULL DEFAULT 'draft',
  confidence DOUBLE PRECISION,
  ready_to_share BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS design_status_idx ON public.design(status);

-- ============================================================ claimevent
CREATE TABLE IF NOT EXISTS public.claimevent (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL DEFAULT '',
  claim_key TEXT NOT NULL DEFAULT '',
  capability_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',            -- verified | rejected | promoted | dismissed
  prev_status TEXT NOT NULL DEFAULT '',
  new_status TEXT NOT NULL DEFAULT '',
  text_snippet TEXT NOT NULL DEFAULT '',
  actioned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claimevent_claim_id_idx ON public.claimevent(claim_id);
CREATE INDEX IF NOT EXISTS claimevent_claim_key_idx ON public.claimevent(claim_key);

-- ============================================================ validationrun
CREATE TABLE IF NOT EXISTS public.validationrun (
  id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL DEFAULT '',
  target_kind TEXT NOT NULL DEFAULT 'design', -- design | blog
  target_id TEXT NOT NULL DEFAULT '',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS validationrun_design_id_idx ON public.validationrun(design_id);
CREATE INDEX IF NOT EXISTS validationrun_target_kind_idx ON public.validationrun(target_kind);
CREATE INDEX IF NOT EXISTS validationrun_target_id_idx ON public.validationrun(target_id);

-- ============================================================ issue
CREATE TABLE IF NOT EXISTS public.issue (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL DEFAULT '',
  validator TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS issue_run_id_idx ON public.issue(run_id);

-- ============================================================ topic
CREATE TABLE IF NOT EXISTS public.topic (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  capability_ids_json TEXT NOT NULL DEFAULT '[]',
  "order" INT NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS topic_slug_idx ON public.topic(slug);
CREATE INDEX IF NOT EXISTS topic_parent_id_idx ON public.topic(parent_id);

-- ============================================================ blog
CREATE TABLE IF NOT EXISTS public.blog (
  id TEXT PRIMARY KEY,
  blog_key TEXT NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 1,
  topic_id TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body_md TEXT NOT NULL DEFAULT '',
  cited_source_ids_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  depth_levels_json TEXT NOT NULL DEFAULT '[]',
  -- draft | checked | validated | needs_review
  status TEXT NOT NULL DEFAULT 'draft',
  confidence DOUBLE PRECISION,
  ready_to_share BOOLEAN NOT NULL DEFAULT false,
  supersedes_id TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blog_blog_key_idx ON public.blog(blog_key);
CREATE INDEX IF NOT EXISTS blog_topic_id_idx ON public.blog(topic_id);
CREATE INDEX IF NOT EXISTS blog_slug_idx ON public.blog(slug);
CREATE INDEX IF NOT EXISTS blog_status_idx ON public.blog(status);
CREATE INDEX IF NOT EXISTS blog_active_idx ON public.blog(active);

-- ============================================================ queueitem
CREATE TABLE IF NOT EXISTS public.queueitem (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  tier INT NOT NULL DEFAULT 6,
  notes TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  -- queued | claimed | ingested | failed | dismissed
  status TEXT NOT NULL DEFAULT 'queued',
  claimed_at TIMESTAMPTZ,
  result_source_id TEXT,
  error TEXT NOT NULL DEFAULT '',
  submitted_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS queueitem_status_idx ON public.queueitem(status);

-- ============================================================ search_doc (replaces SQLite FTS5)
-- One unified full-text row per active claim/source/blog/topic. Populated by the same
-- index_* functions in backend/app/search.py; tsv is a generated tsvector with a GIN index.
CREATE TABLE IF NOT EXISTS public.search_doc (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind TEXT NOT NULL,                          -- claim | source | blog | topic
  ref_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(tags, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'C')
  ) STORED
);
CREATE INDEX IF NOT EXISTS search_doc_tsv_idx ON public.search_doc USING GIN (tsv);
CREATE INDEX IF NOT EXISTS search_doc_kind_idx ON public.search_doc(kind);
CREATE INDEX IF NOT EXISTS search_doc_ref_idx ON public.search_doc(kind, ref_id);

-- ============================================================ RLS: read-only public KB surface
-- Backend writes via service_role (bypasses RLS). anon/authenticated get SELECT only.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'source','claim','asset','design','claimevent','validationrun','issue',
    'topic','blog','queueitem','search_doc'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;

  -- Public-readable knowledge surface (portal + advisor read these directly).
  FOREACH t IN ARRAY ARRAY['source','claim','asset','topic','blog','search_doc'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s public read" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s public read" ON public.%I FOR SELECT USING (true)', t, t);
  END LOOP;
  -- design/validationrun/issue/queueitem: no anon policy -> service_role (backend) only.
END $$;
