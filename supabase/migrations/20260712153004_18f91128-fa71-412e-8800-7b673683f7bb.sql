ALTER TABLE public.diagrams
  ADD COLUMN IF NOT EXISTS interaction_version text NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS static_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS qa_status text NOT NULL DEFAULT 'draft'
    CHECK (qa_status IN ('draft','passed','failed')),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS accessible_summary text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS supported_layers text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.diagram_nodes (
  diagram_slug text NOT NULL REFERENCES public.diagrams(slug) ON DELETE CASCADE,
  node_id text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  classification text NOT NULL DEFAULT 'pattern'
    CHECK (classification IN ('fact','pattern','inference','warning')),
  source_keys text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  drill_type text CHECK (drill_type IN ('topic','capability','article','design','diagram')),
  drill_slug text,
  search_vector tsvector GENERATED ALWAYS AS
    (to_tsvector('english', label || ' ' || description)) STORED,
  PRIMARY KEY (diagram_slug, node_id)
);

CREATE INDEX IF NOT EXISTS diagram_nodes_search_idx
  ON public.diagram_nodes USING GIN (search_vector);
GRANT SELECT ON public.diagram_nodes TO anon, authenticated;
GRANT ALL ON public.diagram_nodes TO service_role;
ALTER TABLE public.diagram_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "diagram_nodes public read" ON public.diagram_nodes;
CREATE POLICY "diagram_nodes public read" ON public.diagram_nodes FOR SELECT USING (true);

ALTER TABLE public.validation_runs
  ADD COLUMN IF NOT EXISTS revision_hash text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS validator_version text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS completed_checks jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.content_items SET ready_to_share = false
WHERE ready_to_share = true
  AND NOT EXISTS (
    SELECT 1 FROM public.validation_runs vr
    WHERE vr.target_id = content_items.id
      AND vr.revision_hash = content_items.content_hash
      AND COALESCE((vr.completed_checks ->> 'complete')::boolean, false)
      AND NOT EXISTS (
        SELECT 1 FROM public.issues i
        WHERE i.validation_run_id = vr.id AND i.severity = 'critical'
      )
  );

CREATE OR REPLACE FUNCTION public.enforce_revision_bound_ready_to_share()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.ready_to_share THEN
    NEW.ready_to_share := EXISTS (
      SELECT 1 FROM public.validation_runs vr
      WHERE vr.target_id = NEW.id
        AND vr.revision_hash = NEW.content_hash
        AND COALESCE((vr.completed_checks ->> 'complete')::boolean, false)
        AND NOT EXISTS (
          SELECT 1 FROM public.issues i
          WHERE i.validation_run_id = vr.id AND i.severity = 'critical'
        )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS content_items_ready_requires_validation ON public.content_items;
CREATE TRIGGER content_items_ready_requires_validation
BEFORE INSERT OR UPDATE OF ready_to_share, content_hash ON public.content_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_revision_bound_ready_to_share();