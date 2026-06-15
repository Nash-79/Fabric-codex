
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  description TEXT NOT NULL,
  accent TEXT NOT NULL DEFAULT 'teal',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.domains TO anon, authenticated;
GRANT ALL ON public.domains TO service_role;
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Domains are public" ON public.domains;
CREATE POLICY "Domains are public" ON public.domains FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  asset_type TEXT NOT NULL DEFAULT 'pattern',
  tags TEXT[] NOT NULL DEFAULT '{}',
  maturity TEXT NOT NULL DEFAULT 'stable',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assets TO anon, authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Assets are public" ON public.assets;
CREATE POLICY "Assets are public" ON public.assets FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS assets_domain_idx ON public.assets(domain_id);

CREATE TABLE IF NOT EXISTS public.favorites (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, asset_id)
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own favorites" ON public.favorites;
DROP POLICY IF EXISTS "Users add own favorites" ON public.favorites;
DROP POLICY IF EXISTS "Users remove own favorites" ON public.favorites;
CREATE POLICY "Users view own favorites" ON public.favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users add own favorites" ON public.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users remove own favorites" ON public.favorites FOR DELETE USING (auth.uid() = user_id);

INSERT INTO public.domains (slug, name, tagline, description, accent, sort_order) VALUES
('data-engineering','Data Engineering','Lakehouse pipelines & transformations','Notebooks, Spark jobs, Dataflows Gen2 and orchestration patterns for medallion lakehouses.','teal',1),
('data-warehouse','Data Warehouse','T-SQL on OneLake','Native warehouse compute, cross-database queries, and federated analytics on OneLake.','indigo',2),
('real-time','Real-Time Intelligence','Eventstreams & KQL databases','Streaming ingestion, KQL analytics, activator rules and reflexes.','amber',3),
('power-bi','Power BI','Semantic models & reports','Direct Lake, composite models, semantic-link, and report performance patterns.','yellow',4),
('data-science','Data Science','MLflow & feature engineering','Notebooks, MLflow experiments, AutoML and model deployment on Fabric.','violet',5),
('governance','Governance & OneLake','Purview, domains, workspace patterns','Domain architecture, OneLake security, sensitivity labels and lineage.','rose',6)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.assets (domain_id, slug, title, summary, body, asset_type, tags, maturity)
SELECT d.id, x.slug, x.title, x.summary, x.body, x.asset_type, x.tags, x.maturity
FROM public.domains d
JOIN (VALUES
('data-engineering','medallion-lakehouse','Medallion Lakehouse Blueprint','Bronze → Silver → Gold zones with Delta, schema enforcement, and incremental MERGE.','A reference blueprint for layering raw, conformed, and curated data in OneLake. Defines folder layout, table naming, Delta retention, and CDC ingestion with Dataflows Gen2 and Spark MERGE.','blueprint',ARRAY['lakehouse','delta','medallion']::text[],'stable'),
('data-engineering','incremental-cdc','Incremental CDC with Dataflows Gen2','Watermark-based extracts that land into Bronze and merge into Silver Delta tables.','Pattern combining Dataflows Gen2 staged ingestion with a Spark notebook MERGE step. Covers late-arriving rows, soft-deletes, and partition pruning.','pattern',ARRAY['cdc','dataflows','spark']::text[],'stable'),
('data-warehouse','warehouse-vs-lakehouse','Warehouse vs Lakehouse: when to use which','Decision matrix across latency, T-SQL surface, concurrency and write semantics.','Use Warehouse for multi-table transactions and full T-SQL DML; use Lakehouse SQL endpoint for read-heavy analytics over Delta. Includes a scoring rubric.','reference',ARRAY['warehouse','lakehouse','decision']::text[],'stable'),
('data-warehouse','cross-database-query','Cross-database queries on OneLake','Three-part naming to join Warehouse, Lakehouse SQL endpoint, and mirrored DBs.','Shows how to federate queries across artifacts in the same workspace using three-part names, plus permission and performance caveats.','pattern',ARRAY['tsql','onelake','federation']::text[],'stable'),
('real-time','eventstream-to-kql','Eventstream → KQL Database','Land high-volume telemetry from Event Hub into a KQL DB with update policies.','End-to-end recipe: source connector, JSON shaping, destination KQL table, update policy to flatten payloads, and a materialized view for hot aggregates.','blueprint',ARRAY['eventstream','kql','streaming']::text[],'stable'),
('real-time','activator-reflex','Activator reflexes for SLA alerts','Trigger Teams / email / Power Automate when a KQL stream crosses a threshold.','How to model a reflex from a KQL query, choose the right grouping key, and wire it to downstream actions without alert storms.','pattern',ARRAY['activator','alerts','kql']::text[],'beta'),
('power-bi','direct-lake-mode','Direct Lake semantic models','Query Delta tables directly without import or DirectQuery fallback.','Sizing guidance, column compression, and fallback behavior. Includes a checklist for keeping models in Direct Lake mode at scale.','reference',ARRAY['powerbi','directlake','delta']::text[],'stable'),
('power-bi','composite-model','Composite models over Direct Lake','Mix Direct Lake fact tables with imported dimensions for flexibility.','When to add an import-mode dimension on top of a Direct Lake fact, relationship cardinality rules, and refresh trade-offs.','pattern',ARRAY['powerbi','composite','modeling']::text[],'stable'),
('data-science','mlflow-experiments','MLflow experiment hygiene','Naming, parameter logging, and model registry promotion on Fabric.','Standardizes experiment names per project, logs hyperparameters and metrics, and gates promotion from Staging to Production via tags.','pattern',ARRAY['mlflow','ml','experiments']::text[],'stable'),
('data-science','semantic-link-features','Semantic-link features from Power BI','Reuse curated Power BI measures as features in notebooks.','Uses SemPy to pull measures from a published semantic model into a notebook for feature engineering — avoids re-deriving business logic.','pattern',ARRAY['sempy','features','powerbi']::text[],'beta'),
('governance','domains-and-workspaces','Domains, workspaces and ownership','Map business domains to Fabric workspaces with clear data product ownership.','A topology guide: domain admins, workspace roles, contact lists, and the boundary between platform and product teams.','blueprint',ARRAY['governance','domains','topology']::text[],'stable'),
('governance','sensitivity-labels','Sensitivity labels end-to-end','Apply MIP labels at source and inherit through Lakehouse, Warehouse and Power BI.','How labels flow from upstream files through OneLake artifacts and into downstream reports, plus how to audit inheritance.','reference',ARRAY['purview','labels','compliance']::text[],'stable')
) AS x(domain_slug, slug, title, summary, body, asset_type, tags, maturity)
  ON x.domain_slug = d.slug
ON CONFLICT (slug) DO NOTHING;
