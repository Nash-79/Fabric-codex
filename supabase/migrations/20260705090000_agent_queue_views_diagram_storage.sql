-- Agent-readable queue/RSS status, diagram capability linkage, and SVG storage support.
--
-- These views are intentionally anon-readable so local Claude/Codex workflows can inspect work
-- without a user session or service-role key. The column whitelist is the privacy boundary.

ALTER TABLE public.diagrams ADD COLUMN IF NOT EXISTS capability_id text REFERENCES public.capabilities(id) ON DELETE SET NULL;

WITH topic_matches AS (
  SELECT DISTINCT ON (d.slug)
    d.slug AS diagram_slug,
    t.slug AS topic_slug
  FROM public.diagrams d
  JOIN public.topics t
    ON d.topic_slug IS NULL
   AND (d.slug = t.slug OR d.slug LIKE t.slug || '-%')
  ORDER BY d.slug, length(t.slug) DESC
)
UPDATE public.diagrams d
SET topic_slug = topic_matches.topic_slug
FROM topic_matches
WHERE d.slug = topic_matches.diagram_slug
  AND d.topic_slug IS NULL;

WITH capability_matches AS (
  SELECT DISTINCT ON (d.slug)
    d.slug AS diagram_slug,
    tc.capability_id
  FROM public.diagrams d
  JOIN public.topic_capabilities tc ON tc.topic_slug = d.topic_slug
  WHERE d.capability_id IS NULL
  ORDER BY d.slug, tc.capability_id
)
UPDATE public.diagrams d
SET capability_id = capability_matches.capability_id
FROM capability_matches
WHERE d.slug = capability_matches.diagram_slug
  AND d.capability_id IS NULL;

CREATE INDEX IF NOT EXISTS diagrams_topic_slug_idx ON public.diagrams(topic_slug);
CREATE INDEX IF NOT EXISTS diagrams_capability_id_idx ON public.diagrams(capability_id);

CREATE OR REPLACE VIEW public.queue_public
WITH (security_barrier = true) AS
SELECT
  id,
  kind,
  url,
  title,
  tier,
  tags,
  notes,
  target_slug,
  scheduled_at,
  status,
  created_at,
  claimed_at
FROM public.queue_items
WHERE status IN ('queued', 'claimed', 'failed');

CREATE OR REPLACE VIEW public.rss_status_public
WITH (security_barrier = true) AS
SELECT
  id,
  title,
  feed_url,
  status,
  default_tier,
  default_tags,
  last_polled_at,
  last_seen_guid,
  error_count,
  last_error
FROM public.rss_subscriptions;

GRANT SELECT ON public.queue_public TO anon, authenticated;
GRANT SELECT ON public.rss_status_public TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('diagrams', 'diagrams', true, 524288, ARRAY['image/svg+xml'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read diagrams storage" ON storage.objects;
CREATE POLICY "Public read diagrams storage" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'diagrams');

-- Collapse the old note/notes duplication. Existing writers should use notes only after this.
UPDATE public.queue_items
SET notes = COALESCE(NULLIF(notes, ''), note, '')
WHERE note IS NOT NULL;

ALTER TABLE public.queue_items DROP COLUMN IF EXISTS note;

ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorites_item_type_check;
ALTER TABLE public.favorites ADD CONSTRAINT favorites_item_type_check
  CHECK (item_type IN ('blog','article','design','lesson','topic','capability','source','claim'));
