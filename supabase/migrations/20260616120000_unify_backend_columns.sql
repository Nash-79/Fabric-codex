-- Unify the FastAPI backend onto Lovable's canonical KB schema (Direction A).
--
-- Lovable's migrations (20260615205955, 20260615212747) own the schema: plural tables,
-- uuid PKs, real FKs, junction tables (topic_capabilities, blog_sources), a capabilities
-- registry table, auth/RLS. This migration ADDS the columns and tables the FastAPI/SQLModel
-- backend needs so the full backend feature set (claim audit trail, queue lifecycle, asset
-- attribution, reader metadata, drift fingerprinting) survives on that one schema — no second
-- schema, nothing lost. Versioning is slug + supersedes_id chains (no *_key family columns).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS. Safe to re-run.

-- ---------------------------------------------------------------- sources
-- Reader metadata + drift fingerprint + version/active/status the backend writes.
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT '';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS why_it_matters text NOT NULL DEFAULT '';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS takeaways text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS content_hash text NOT NULL DEFAULT '';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
-- slug is UNIQUE in Lovable's schema; versioning supersedes by deactivating the old row and
-- inserting a new active row that reuses the slug is not possible under UNIQUE(slug). So the
-- family identity for sources is the slug, and only ONE row per slug exists; drift updates the
-- row's claims in place via claim supersedes chains. Keep slug UNIQUE.

-- ---------------------------------------------------------------- claims
-- confidence (0..1) drives verify; status vocabulary matches the backend.
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS confidence double precision NOT NULL DEFAULT 0.5;
-- Backend statuses: pending | verified | rejected | superseded | deprecated | duplicate.
-- Lovable defaulted status to 'approved'; realign the default to 'pending' (human-approval gate).
ALTER TABLE public.claims ALTER COLUMN status SET DEFAULT 'pending';

-- ---------------------------------------------------------------- blogs
-- Citations live in blog_sources (junction), but the backend also tracks depth levels,
-- a ready-to-share gate, and the supersedes chain for versioned articles.
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS depth_levels int[] NOT NULL DEFAULT '{}';
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS ready_to_share boolean NOT NULL DEFAULT false;
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS supersedes_id uuid REFERENCES public.blogs(id);

-- ---------------------------------------------------------------- topics
-- Backend keeps an explicit active flag and tags on topics.
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- ---------------------------------------------------------------- queue_items (lifecycle)
-- The agent ingestion loop needs the full state machine, not just pending/done.
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS tier int NOT NULL DEFAULT 6;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS result_source_id uuid REFERENCES public.sources(id) ON DELETE SET NULL;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS error text NOT NULL DEFAULT '';
-- Lovable's queue 'note' maps to the backend's 'notes'; add notes if missing and backfill.
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
-- status vocabulary: queued | claimed | ingested | failed | dismissed (default queued).
ALTER TABLE public.queue_items ALTER COLUMN status SET DEFAULT 'queued';

-- ---------------------------------------------------------------- claimevents (audit trail)
-- One row per human curation action on a claim. No Lovable equivalent — add it.
CREATE TABLE IF NOT EXISTS public.claimevents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid REFERENCES public.claims(id) ON DELETE CASCADE,
  capability_id text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',          -- verified | rejected | promoted | dismissed
  prev_status text NOT NULL DEFAULT '',
  new_status text NOT NULL DEFAULT '',
  text_snippet text NOT NULL DEFAULT '',
  actioned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claimevents_claim_id_idx ON public.claimevents(claim_id);
GRANT SELECT ON public.claimevents TO anon, authenticated;
GRANT ALL ON public.claimevents TO service_role;
ALTER TABLE public.claimevents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "claimevents public read" ON public.claimevents;
CREATE POLICY "claimevents public read" ON public.claimevents FOR SELECT USING (true);

-- ---------------------------------------------------------------- assets (attributed images + generated diagrams)
-- Lovable has a `diagrams` table (generated originals). The backend's Asset model also covers
-- `referenced` external images with attribution (copyright-safe, link-only). Add a superset
-- assets table; the diagrams table stays for the frontend's diagram listing.
CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'generated',   -- referenced | generated
  url text NOT NULL DEFAULT '',
  path text NOT NULL DEFAULT '',
  mime text NOT NULL DEFAULT 'image/svg+xml',
  caption text NOT NULL DEFAULT '',
  attribution text NOT NULL DEFAULT '',      -- required for referenced assets
  license_note text NOT NULL DEFAULT '',
  capability_id text DEFAULT '',
  source_id uuid REFERENCES public.sources(id) ON DELETE CASCADE,
  claim_id uuid REFERENCES public.claims(id) ON DELETE CASCADE,
  design_id uuid REFERENCES public.designs(id) ON DELETE CASCADE,
  blog_id uuid REFERENCES public.blogs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_source_id_idx ON public.assets(source_id);
CREATE INDEX IF NOT EXISTS assets_blog_id_idx ON public.assets(blog_id);
GRANT SELECT ON public.assets TO anon, authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assets public read" ON public.assets;
CREATE POLICY "assets public read" ON public.assets FOR SELECT USING (true);

-- ---------------------------------------------------------------- designs (solution architect output)
-- Lovable's designs table is minimal; the backend tracks the generation inputs, citations,
-- and the validation gate. Add the columns it needs (body_md/status already exist).
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS scenario text NOT NULL DEFAULT '';
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS constraints jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS confidence double precision;
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS ready_to_share boolean NOT NULL DEFAULT false;

-- Design ↔ Source citations (mirror blog_sources so designs cite the same way).
CREATE TABLE IF NOT EXISTS public.design_sources (
  design_id uuid NOT NULL REFERENCES public.designs(id) ON DELETE CASCADE,
  label text NOT NULL,
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  PRIMARY KEY (design_id, label)
);
GRANT SELECT ON public.design_sources TO anon, authenticated;
GRANT ALL ON public.design_sources TO service_role;
ALTER TABLE public.design_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "design_sources public read" ON public.design_sources;
CREATE POLICY "design_sources public read" ON public.design_sources FOR SELECT USING (true);

-- ---------------------------------------------------------------- validation_runs / issues (generalise to blogs)
-- Lovable scoped validation_runs to designs only. The backend validates blogs too.
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS target_kind text NOT NULL DEFAULT 'design'; -- design | blog
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS confidence double precision;
ALTER TABLE public.validation_runs ALTER COLUMN design_id DROP NOT NULL;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS validator text NOT NULL DEFAULT '';
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS ref text NOT NULL DEFAULT '';

-- Seed the capabilities registry from the backend's CAPABILITY_IDS (idempotent).
INSERT INTO public.capabilities (id, name) VALUES
  ('fabric-platform','Fabric Platform'), ('onelake','OneLake'), ('lakehouse','Lakehouse'),
  ('warehouse','Warehouse'), ('polaris','Polaris'), ('direct-lake','Direct Lake'),
  ('semantic-model','Semantic Model'), ('power-bi','Power BI'), ('data-factory','Data Factory'),
  ('dataflow-gen2','Dataflow Gen2'), ('spark','Spark'), ('rti','Real-Time Intelligence'),
  ('eventhouse-kql','Eventhouse / KQL'), ('sql-database','SQL Database'), ('mirroring','Mirroring'),
  ('fabric-data-agent','Fabric Data Agent'), ('fabric-iq','Fabric IQ'), ('graphql-api','GraphQL API'),
  ('purview','Purview'), ('capacity','Capacity')
ON CONFLICT (id) DO NOTHING;
