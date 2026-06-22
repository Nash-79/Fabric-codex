-- Lock down EXECUTE on SECURITY DEFINER helpers so anonymous callers can't invoke them.
-- These functions are intended for triggers, RLS checks, or admin RPCs only.

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_user_has_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_record_event(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_event(text, text, text, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_suspend_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_approve_user(uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_user(uuid, public.app_role[]) TO authenticated, service_role;

-- Trigger-only functions: no direct caller needs EXECUTE.
REVOKE ALL ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin() TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO service_role;

-- search_atlas: convert to SECURITY INVOKER so visitor-scoped RLS applies.
-- The function still needs to be reachable by both anonymous and signed-in
-- visitors for the public knowledge-base search.
CREATE OR REPLACE FUNCTION public.search_atlas(term text, max_results integer DEFAULT 20)
 RETURNS TABLE(kind text, rank real, payload jsonb)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  WITH query AS (
    SELECT websearch_to_tsquery('english', coalesce(term, '')) AS q
  ),
  hits AS (
    SELECT
      'blog'::text AS kind,
      ts_rank(
        to_tsvector('english', b.title || ' ' || coalesce(b.summary, '') || ' ' || coalesce(b.body_md, '')),
        query.q
      ) AS rank,
      jsonb_build_object('slug', b.slug, 'title', b.title, 'summary', b.summary) AS payload
    FROM public.blogs b, query
    WHERE b.active AND b.status = 'published'
      AND to_tsvector('english', b.title || ' ' || coalesce(b.summary, '') || ' ' || coalesce(b.body_md, '')) @@ query.q
    UNION ALL
    SELECT
      'claim'::text,
      ts_rank(to_tsvector('english', c.text), query.q),
      jsonb_build_object('id', c.id, 'text', c.text, 'depth', c.depth, 'capability_id', c.capability_id,
        'sources', jsonb_build_object('slug', s.slug, 'title', s.title, 'tier', s.tier, 'url', s.url))
    FROM public.claims c JOIN public.sources s ON s.id = c.source_id, query
    WHERE c.active AND to_tsvector('english', c.text) @@ query.q
    UNION ALL
    SELECT
      'source'::text,
      ts_rank(to_tsvector('english', s.title || ' ' || coalesce(s.summary, '')), query.q),
      jsonb_build_object('slug', s.slug, 'title', s.title, 'url', s.url, 'tier', s.tier, 'summary', s.summary)
    FROM public.sources s, query
    WHERE s.active AND to_tsvector('english', s.title || ' ' || coalesce(s.summary, '')) @@ query.q
    UNION ALL
    SELECT
      'topic'::text,
      ts_rank(to_tsvector('english', t.name || ' ' || coalesce(t.description, '')), query.q),
      jsonb_build_object('slug', t.slug, 'name', t.name, 'description', t.description)
    FROM public.topics t, query
    WHERE t.active AND to_tsvector('english', t.name || ' ' || coalesce(t.description, '')) @@ query.q
  )
  SELECT hits.kind, hits.rank, hits.payload FROM hits
  ORDER BY hits.rank DESC
  LIMIT greatest(1, least(coalesce(max_results, 20), 100));
$function$;

REVOKE ALL ON FUNCTION public.search_atlas(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_atlas(text, integer) TO anon, authenticated, service_role;