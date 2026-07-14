-- Preserve the full Fabric GPS JSON release payload and its canonical Microsoft blog link.
-- Fabric GPS is a community aggregator, so roadmap rows retain that provenance. Canonical blog
-- URLs are separately queued and graded by their own host before entering the claim workflow.

ALTER TABLE public.roadmap_items
  ADD COLUMN IF NOT EXISTS release_item_id text,
  ADD COLUMN IF NOT EXISTS feature_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS release_date text,
  ADD COLUMN IF NOT EXISTS release_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS product_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS feature_description text,
  ADD COLUMN IF NOT EXISTS blog_title text,
  ADD COLUMN IF NOT EXISTS blog_url text,
  ADD COLUMN IF NOT EXISTS last_modified date,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.roadmap_items
SET release_item_id = substring(guid from '/release/([^/?#]+)'),
    feature_name = title,
    release_date = NULLIF(target_release, '')
WHERE release_item_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS roadmap_items_release_item_id_idx
  ON public.roadmap_items(release_item_id)
  WHERE release_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS roadmap_items_product_name_idx
  ON public.roadmap_items(product_name);
CREATE INDEX IF NOT EXISTS roadmap_items_last_modified_idx
  ON public.roadmap_items(last_modified DESC);
CREATE INDEX IF NOT EXISTS roadmap_items_blog_url_idx
  ON public.roadmap_items(blog_url)
  WHERE blog_url IS NOT NULL;

COMMENT ON COLUMN public.roadmap_items.raw_payload IS
  'Unmodified current release object returned by https://www.fabric-gps.com/api/releases.';
COMMENT ON COLUMN public.roadmap_items.blog_url IS
  'Canonical blog URL supplied by Fabric GPS; separately source-graded before queue auto-claim.';
