-- Drift fix: applying repo migration 20260616120000_unify_backend_columns.sql
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT '';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS why_it_matters text NOT NULL DEFAULT '';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS takeaways text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS content_hash text NOT NULL DEFAULT '';
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS confidence double precision NOT NULL DEFAULT 0.5;
ALTER TABLE public.claims ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS depth_levels int[] NOT NULL DEFAULT '{}';
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS ready_to_share boolean NOT NULL DEFAULT false;
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS supersedes_id uuid REFERENCES public.blogs(id);

ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS tier int NOT NULL DEFAULT 6;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS result_source_id uuid REFERENCES public.sources(id) ON DELETE SET NULL;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS error text NOT NULL DEFAULT '';
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE public.queue_items ALTER COLUMN status SET DEFAULT 'queued';

CREATE TABLE IF NOT EXISTS public.claimevents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid REFERENCES public.claims(id) ON DELETE CASCADE,
  capability_id text NOT NULL DEFAULT '',
  action text NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'generated',
  url text NOT NULL DEFAULT '',
  path text NOT NULL DEFAULT '',
  mime text NOT NULL DEFAULT 'image/svg+xml',
  caption text NOT NULL DEFAULT '',
  attribution text NOT NULL DEFAULT '',
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

ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS scenario text NOT NULL DEFAULT '';
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS constraints jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS confidence double precision;
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS ready_to_share boolean NOT NULL DEFAULT false;

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

ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS target_kind text NOT NULL DEFAULT 'design';
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE public.validation_runs ADD COLUMN IF NOT EXISTS confidence double precision;
ALTER TABLE public.validation_runs ALTER COLUMN design_id DROP NOT NULL;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS validator text NOT NULL DEFAULT '';
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS ref text NOT NULL DEFAULT '';

INSERT INTO public.capabilities (id, name) VALUES
  ('fabric-platform','Fabric Platform'), ('onelake','OneLake'), ('lakehouse','Lakehouse'),
  ('warehouse','Warehouse'), ('polaris','Polaris'), ('direct-lake','Direct Lake'),
  ('semantic-model','Semantic Model'), ('power-bi','Power BI'), ('data-factory','Data Factory'),
  ('dataflow-gen2','Dataflow Gen2'), ('spark','Spark'), ('rti','Real-Time Intelligence'),
  ('eventhouse-kql','Eventhouse / KQL'), ('sql-database','SQL Database'), ('mirroring','Mirroring'),
  ('fabric-data-agent','Fabric Data Agent'), ('fabric-iq','Fabric IQ'), ('graphql-api','GraphQL API'),
  ('purview','Purview'), ('capacity','Capacity')
ON CONFLICT (id) DO NOTHING;