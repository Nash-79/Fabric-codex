-- The learning-portal ordering primitive (Phase 1 / WP1.1 of docs/plan/phase-1-curriculum.md).
--
-- Fixes the core defect blocking "learning portal": getContentSiblings orders by
-- `updated_at DESC`, so Prev/Next is recency order, not a curriculum -- editing an old article
-- silently reorders "next" for every reader. content_items has no sort_order/sequence/path
-- concept at all; topics.sort_order groups by product area, not learning sequence.
--
-- Deliberately references content_items by (kind, slug), never by id. content_items is versioned
-- (supersedes_id chain; a superseded row survives, active=false, slug renamed to
-- {slug}@v{version} -- see 20260630120000_unify_content_items.sql). Its uniqueness on (kind, slug)
-- is only a PARTIAL index (`WHERE active`), so it cannot back a real foreign key -- a hard FK on
-- content_item_id would either reject inserts against the partial-unique pair or silently pin a
-- path to one specific historical version once it's superseded (the same latent staleness
-- content_feedback.content_item_id already has). Resolving (kind, slug) -> the active row at read
-- time, the same way getContentSiblings/getContentItem already do, is what actually survives
-- republish.

CREATE TABLE public.learning_paths (
  slug text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',              -- who it's for, in plain words
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.path_items (
  path_slug text NOT NULL REFERENCES public.learning_paths(slug) ON DELETE CASCADE,
  content_kind text NOT NULL CHECK (content_kind IN ('article', 'design', 'lesson')),
  content_slug text NOT NULL,
  position int NOT NULL,
  optional boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (path_slug, content_kind, content_slug)
);

-- One item per position per path -- lets the server order by position with a stable, unambiguous
-- sequence (no two items tie for "next").
CREATE UNIQUE INDEX path_items_position_idx ON public.path_items (path_slug, position);

-- The reverse lookup getContentSiblings needs: "what path(s), if any, is this (kind, slug) in".
CREATE INDEX path_items_content_idx ON public.path_items (content_kind, content_slug);

-- prerequisite_ids stores SLUGS, not uuids -- same versioning reasoning as path_items above, and
-- matches the schema comment's own naming: existing code (lessonMetaSchema in
-- content-presentation.ts) already calls this concept `prerequisites: string[]`, just not
-- populated or link-checked yet. Column name kept as `prerequisite_ids` for continuity with this
-- migration's plan doc; contents are slugs scoped to the same content_kind as the row itself.
ALTER TABLE public.content_items
  ADD COLUMN prerequisite_ids text[] NOT NULL DEFAULT '{}';

-- Matches the roadmap_items convention (an admin/system-managed table, not author's occasional
-- edits like topics): public read, no authenticated-write policy -- curriculum authoring goes
-- through server functions using the service role, same as every other admin-owned table.
GRANT SELECT ON public.learning_paths TO anon, authenticated;
GRANT ALL ON public.learning_paths TO service_role;
ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read learning paths" ON public.learning_paths FOR SELECT USING (true);

GRANT SELECT ON public.path_items TO anon, authenticated;
GRANT ALL ON public.path_items TO service_role;
ALTER TABLE public.path_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read path items" ON public.path_items FOR SELECT USING (true);
