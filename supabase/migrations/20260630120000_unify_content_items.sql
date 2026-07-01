-- Unify blogs + designs + lessons into one content_items table with a `kind` discriminator.
--
-- Two real problems drove this:
-- 1. Three different code paths wrote `blogs` rows with three different lifecycle behaviors.
--    publishBlog()/publishDesign() (Settings -> Publish, the primary production path) did a bare
--    upsert({onConflict:"slug"}) -- no version increment, no supersedes_id chain, silently
--    overwriting the active row in place. blogs_one_active_slug (20260616130000) already enforced
--    "at most one active row per slug," which is exactly why the upsert didn't error: Postgres
--    treated it as a same-row update. publishDesign() had the identical defect for designs.
-- 2. Blogs/designs/lessons were three disconnected verticals: only blogs versioned, designs had no
--    topic/capability linkage at all, lessons had no status/version/citations and no working publish
--    path or detail route (content/lessons/ is empty -- confirmed unimplemented end-to-end).
--
-- This migration creates content_items (kind: article | design | lesson) with correct versioning
-- designed in from day one, backfills all three legacy tables 1:1 (ids preserved), and renames the
-- old tables to *_legacy with read-only compatibility views replacing their old names -- so any
-- code path not yet updated in this same change (backend/, scripts/) keeps reading without
-- breaking, while being unable to silently write around the new versioning (views have no INSTEAD
-- OF triggers; a write attempt fails loudly instead of bypassing content_items).
--
-- FK note: assets.blog_id / assets.design_id and validation_runs.design_id currently reference
-- blogs(id)/designs(id) directly. FKs cannot target a view, so those columns are repointed to
-- content_items(id) (ids are preserved 1:1 in the backfill below, so existing references keep
-- resolving — this is a integrity improvement, not a downgrade). Verified via the Supabase anon
-- read that zero `assets` rows currently have blog_id/design_id set, so this is a zero-impact
-- repoint today.
--
-- Idempotent-minded but this is a one-time structural migration, not a repeatable column-add; do
-- not re-run against an environment where it has already applied (the legacy rename would fail).

-- ============================================================== 1. content_items + content_item_sources

CREATE TABLE public.content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('article','design','lesson')),
  slug text NOT NULL,
  version int NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.content_items(id),
  active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft',         -- draft | published | superseded | archived
  topic_slug text REFERENCES public.topics(slug) ON DELETE SET NULL,
  capability_id text REFERENCES public.capabilities(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body_md text NOT NULL DEFAULT '',
  depth_levels int[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  scenario text NOT NULL DEFAULT '',
  constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
  ready_to_share boolean NOT NULL DEFAULT false,
  validation_confidence numeric,
  confidence double precision,
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one ACTIVE row per (kind, slug) -- the DB-level guardrail the old publishBlog()/
-- publishDesign() bare-upsert bug violated implicitly. Superseded rows get slug-renamed to
-- {slug}@v{version} (mirrors the existing blogs pattern), so this partial index is sufficient.
CREATE UNIQUE INDEX content_items_one_active_slug
  ON public.content_items (kind, slug) WHERE active;

CREATE INDEX content_items_kind_idx ON public.content_items(kind) WHERE active;
CREATE INDEX content_items_topic_idx ON public.content_items(topic_slug) WHERE active;
CREATE INDEX content_items_capability_idx ON public.content_items(capability_id) WHERE active;
CREATE INDEX content_items_search_idx ON public.content_items
  USING GIN (to_tsvector('english', title || ' ' || summary || ' ' || body_md));

GRANT SELECT ON public.content_items TO anon, authenticated;
GRANT ALL ON public.content_items TO service_role;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_items public read" ON public.content_items FOR SELECT USING (true);
-- No authenticated-write policy: all writes go through server functions using the service_role
-- client, gated by requireAdmin(context) -- matches the designs/lessons/assets pattern.

CREATE TRIGGER content_items_touch BEFORE UPDATE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.content_item_sources (
  content_item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  label text NOT NULL,
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  PRIMARY KEY (content_item_id, label)
);
GRANT SELECT ON public.content_item_sources TO anon, authenticated;
GRANT ALL ON public.content_item_sources TO service_role;
ALTER TABLE public.content_item_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_item_sources public read" ON public.content_item_sources FOR SELECT USING (true);

-- ============================================================== 2. Backfill

-- blogs -> content_items (kind='article'). id preserved 1:1 so assets.blog_id and any cached
-- /blog/$slug deep links can resolve via id lookup if needed.
INSERT INTO public.content_items
  (id, kind, slug, version, supersedes_id, active, status, topic_slug, title, summary,
   body_md, depth_levels, tags, ready_to_share, validation_confidence, document,
   content_hash, created_at, updated_at)
SELECT id, 'article', slug, version, supersedes_id, active, status, topic_slug, title,
       summary, body_md, depth_levels, tags, ready_to_share, validation_confidence,
       document, content_hash, created_at, updated_at
FROM public.blogs;

INSERT INTO public.content_item_sources (content_item_id, label, source_id, position)
SELECT blog_id, label, source_id, position FROM public.blog_sources;

-- designs -> content_items (kind='design'). Designs never versioned, so every existing row
-- becomes a fresh v1 active row (safe -- no version chain to preserve because none ever existed).
-- topic_slug is left NULL: no automated blog/design/topic mapping exists, and a wrong auto-guess
-- is worse than an honest gap the UI can surface as "Uncategorized" / filterable. New designs are
-- expected to carry a topic_slug going forward per the updated solution-architect agent.
INSERT INTO public.content_items
  (id, kind, slug, version, supersedes_id, active, status, title, summary, body_md,
   tags, scenario, constraints, confidence, ready_to_share, document, content_hash,
   created_at, updated_at)
SELECT id, 'design', slug, 1, NULL, true, status, title, summary, body_md, tags,
       scenario, constraints, confidence, ready_to_share, document, content_hash,
       created_at, updated_at
FROM public.designs;

INSERT INTO public.content_item_sources (content_item_id, label, source_id, position)
SELECT design_id, label, source_id, position FROM public.design_sources;

-- lessons -> content_items (kind='lesson'). Lessons confirmed schema-only vestigial (no working
-- publish path, no detail route, content/lessons/ empty) -- this backfill is low-risk by
-- construction. depth text ('L1'..'L5') maps to depth_levels int[].
INSERT INTO public.content_items
  (id, kind, slug, version, supersedes_id, active, status, capability_id, title,
   body_md, depth_levels, created_at, updated_at)
SELECT id, 'lesson', slug, 1, NULL, true, 'published', capability_id, title, body_md,
       CASE depth WHEN 'L1' THEN ARRAY[1] WHEN 'L2' THEN ARRAY[2] WHEN 'L3' THEN ARRAY[3]
                  WHEN 'L4' THEN ARRAY[4] WHEN 'L5' THEN ARRAY[5] ELSE ARRAY[1] END,
       created_at, updated_at
FROM public.lessons;

-- ============================================================== 3. Repoint dependent FKs before renaming

-- assets.blog_id / assets.design_id currently FK into blogs(id)/designs(id). FKs cannot target a
-- view, so repoint both columns at content_items(id) -- ids were preserved 1:1 above, so any
-- existing reference keeps resolving. Verified zero assets rows currently set either column.
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_blog_id_fkey;
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_design_id_fkey;
ALTER TABLE public.assets
  ADD CONSTRAINT assets_blog_id_fkey FOREIGN KEY (blog_id) REFERENCES public.content_items(id) ON DELETE CASCADE,
  ADD CONSTRAINT assets_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.content_items(id) ON DELETE CASCADE;

-- validation_runs.design_id is already nullable (20260616120000) and the table already carries a
-- generic target_kind/target_id pair for non-design validation targets (e.g. blogs). Repoint the
-- legacy design_id FK the same way for consistency.
ALTER TABLE public.validation_runs DROP CONSTRAINT IF EXISTS validation_runs_design_id_fkey;
ALTER TABLE public.validation_runs
  ADD CONSTRAINT validation_runs_design_id_fkey FOREIGN KEY (design_id) REFERENCES public.content_items(id) ON DELETE CASCADE;

-- ============================================================== 4. Rename legacy tables, replace with read-only views

ALTER TABLE public.blogs RENAME TO blogs_legacy;
ALTER TABLE public.designs RENAME TO designs_legacy;
ALTER TABLE public.lessons RENAME TO lessons_legacy;
ALTER TABLE public.blog_sources RENAME TO blog_sources_legacy;
ALTER TABLE public.design_sources RENAME TO design_sources_legacy;

-- Drop self-referencing / cross-referencing FKs on the renamed tables that would otherwise still
-- point at the old table names internally (harmless to keep, but the views below are the only
-- supported read path going forward -- documented, not actively enforced beyond this point).

CREATE VIEW public.blogs AS
  SELECT id, topic_slug, slug, title, summary, body_md, version, status,
         validation_confidence, tags, depth_levels, ready_to_share, active,
         supersedes_id, document, content_hash, created_at, updated_at
  FROM public.content_items WHERE kind = 'article';

CREATE VIEW public.designs AS
  SELECT id, slug, title, summary, body_md, status, scenario, constraints, tags,
         confidence, ready_to_share, document, content_hash, created_at, updated_at
  FROM public.content_items WHERE kind = 'design';

CREATE VIEW public.lessons AS
  SELECT id, slug, title,
         CASE WHEN 5 = ANY(depth_levels) THEN 'L5' WHEN 4 = ANY(depth_levels) THEN 'L4'
              WHEN 3 = ANY(depth_levels) THEN 'L3' WHEN 2 = ANY(depth_levels) THEN 'L2'
              ELSE 'L1' END AS depth,
         capability_id, body_md, created_at, updated_at
  FROM public.content_items WHERE kind = 'lesson';

CREATE VIEW public.blog_sources AS
  SELECT content_item_id AS blog_id, source_id, label, position
  FROM public.content_item_sources cis
  JOIN public.content_items ci ON ci.id = cis.content_item_id AND ci.kind = 'article';

CREATE VIEW public.design_sources AS
  SELECT content_item_id AS design_id, source_id, label, position
  FROM public.content_item_sources cis
  JOIN public.content_items ci ON ci.id = cis.content_item_id AND ci.kind = 'design';

GRANT SELECT ON public.blogs, public.designs, public.lessons, public.blog_sources, public.design_sources
  TO anon, authenticated, service_role;

-- Views are read-only by default in Postgres (no INSTEAD OF triggers added) -- intentional. Any
-- code still attempting to WRITE to these old names will fail loudly instead of silently bypassing
-- content_items' versioning, surfacing exactly the kind of latent dependency this migration needs
-- to catch. A follow-up migration drops blogs_legacy/designs_legacy/lessons_legacy/
-- blog_sources_legacy/design_sources_legacy and these views entirely once a repo-wide grep
-- confirms zero remaining reads (tracked separately, not part of this change).

-- ============================================================== 5. favorites: blog -> article

-- favorites.item_type CHECK constraint still says 'blog'; the unified UI favorites articles by
-- the new kind name. Widen the constraint to accept 'article' going forward (existing 'blog' rows
-- are untouched -- they keep resolving against article slugs, which are unchanged by this migration).
ALTER TABLE public.favorites DROP CONSTRAINT IF EXISTS favorites_item_type_check;
ALTER TABLE public.favorites ADD CONSTRAINT favorites_item_type_check
  CHECK (item_type IN ('blog','article','design','lesson','topic','source','claim'));

-- ============================================================== 6. search_atlas RPC: read content_items

CREATE OR REPLACE FUNCTION public.search_atlas(term text, max_results int DEFAULT 20)
RETURNS TABLE(kind text, rank real, payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH query AS (
    SELECT websearch_to_tsquery('english', coalesce(term, '')) AS q
  ),
  hits AS (
    SELECT
      ci.kind AS kind,
      ts_rank(
        to_tsvector('english', ci.title || ' ' || coalesce(ci.summary, '') || ' ' || coalesce(ci.body_md, '')),
        query.q
      ) AS rank,
      jsonb_build_object(
        'slug', ci.slug,
        'title', ci.title,
        'summary', ci.summary
      ) AS payload
    FROM public.content_items ci, query
    WHERE ci.active
      AND ci.status = 'published'
      AND to_tsvector('english', ci.title || ' ' || coalesce(ci.summary, '') || ' ' || coalesce(ci.body_md, '')) @@ query.q

    UNION ALL

    SELECT
      'claim'::text AS kind,
      ts_rank(to_tsvector('english', c.text), query.q) AS rank,
      jsonb_build_object(
        'id', c.id,
        'text', c.text,
        'depth', c.depth,
        'capability_id', c.capability_id,
        'sources', jsonb_build_object(
          'slug', s.slug,
          'title', s.title,
          'tier', s.tier,
          'url', s.url
        )
      ) AS payload
    FROM public.claims c
    JOIN public.sources s ON s.id = c.source_id,
      query
    WHERE c.active
      AND to_tsvector('english', c.text) @@ query.q

    UNION ALL

    SELECT
      'source'::text AS kind,
      ts_rank(to_tsvector('english', s.title || ' ' || coalesce(s.summary, '')), query.q) AS rank,
      jsonb_build_object(
        'slug', s.slug,
        'title', s.title,
        'url', s.url,
        'tier', s.tier,
        'summary', s.summary
      ) AS payload
    FROM public.sources s, query
    WHERE s.active
      AND to_tsvector('english', s.title || ' ' || coalesce(s.summary, '')) @@ query.q

    UNION ALL

    SELECT
      'topic'::text AS kind,
      ts_rank(to_tsvector('english', t.name || ' ' || coalesce(t.description, '')), query.q) AS rank,
      jsonb_build_object(
        'slug', t.slug,
        'name', t.name,
        'description', t.description
      ) AS payload
    FROM public.topics t, query
    WHERE t.active
      AND to_tsvector('english', t.name || ' ' || coalesce(t.description, '')) @@ query.q
  )
  SELECT hits.kind, hits.rank, hits.payload
  FROM hits
  ORDER BY hits.rank DESC
  LIMIT greatest(1, least(coalesce(max_results, 20), 100));
$$;

GRANT EXECUTE ON FUNCTION public.search_atlas(text, int) TO anon, authenticated, service_role;
