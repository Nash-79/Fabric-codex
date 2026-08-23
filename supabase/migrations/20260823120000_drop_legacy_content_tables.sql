-- Drops the *_legacy tables and their read-only compat views left behind by
-- 20260630120000_unify_content_items.sql, per that migration's own follow-up note (section 4):
-- "A follow-up migration drops blogs_legacy/designs_legacy/lessons_legacy/blog_sources_legacy/
-- design_sources_legacy and these views entirely once a repo-wide grep confirms zero remaining
-- reads."
--
-- Precondition verified 2026-08-23: `grep -rn "blogs_legacy\|designs_legacy\|lessons_legacy\|
-- blog_sources_legacy\|design_sources_legacy" src/ scripts/` returns zero application-code reads
-- — the only remaining references are in the auto-generated src/integrations/supabase/types.ts,
-- which regenerates itself from the live schema on the next `npm run gen:types` after this runs.
--
-- NOT auto-applied as part of routine cleanup — dropping tables is irreversible against a live
-- database. Apply deliberately with `supabase db push` (or run this file's SQL directly) once you
-- have independently confirmed no external consumer (a saved query, an admin script outside this
-- repo, a BI tool) still reads blogs/designs/lessons/blog_sources/design_sources by their old
-- names through the compat views.

DROP VIEW IF EXISTS public.blogs;
DROP VIEW IF EXISTS public.designs;
DROP VIEW IF EXISTS public.lessons;
DROP VIEW IF EXISTS public.blog_sources;
DROP VIEW IF EXISTS public.design_sources;

DROP TABLE IF EXISTS public.blog_sources_legacy;
DROP TABLE IF EXISTS public.design_sources_legacy;
DROP TABLE IF EXISTS public.blogs_legacy;
DROP TABLE IF EXISTS public.designs_legacy;
DROP TABLE IF EXISTS public.lessons_legacy;
