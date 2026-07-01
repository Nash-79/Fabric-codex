
ALTER VIEW public.design_sources SET (security_invoker = true);
ALTER VIEW public.blogs SET (security_invoker = true);
ALTER VIEW public.designs SET (security_invoker = true);
ALTER VIEW public.lessons SET (security_invoker = true);
ALTER VIEW public.blog_sources SET (security_invoker = true);

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
      ci.kind AS kind,
      ts_rank(
        to_tsvector('english', ci.title || ' ' || coalesce(ci.summary, '') || ' ' || coalesce(ci.body_md, '')),
        query.q
      ) AS rank,
      jsonb_build_object('slug', ci.slug, 'title', ci.title, 'summary', ci.summary) AS payload
    FROM public.content_items ci, query
    WHERE ci.active AND ci.status = 'published'
      AND to_tsvector('english', ci.title || ' ' || coalesce(ci.summary, '') || ' ' || coalesce(ci.body_md, '')) @@ query.q
    UNION ALL
    SELECT 'claim'::text,
      ts_rank(to_tsvector('english', c.text), query.q),
      jsonb_build_object('id', c.id, 'text', c.text, 'depth', c.depth, 'capability_id', c.capability_id,
        'sources', jsonb_build_object('slug', s.slug, 'title', s.title, 'tier', s.tier, 'url', s.url))
    FROM public.claims c JOIN public.sources s ON s.id = c.source_id, query
    WHERE c.active AND to_tsvector('english', c.text) @@ query.q
    UNION ALL
    SELECT 'source'::text,
      ts_rank(to_tsvector('english', s.title || ' ' || coalesce(s.summary, '')), query.q),
      jsonb_build_object('slug', s.slug, 'title', s.title, 'url', s.url, 'tier', s.tier, 'summary', s.summary)
    FROM public.sources s, query
    WHERE s.active AND to_tsvector('english', s.title || ' ' || coalesce(s.summary, '')) @@ query.q
    UNION ALL
    SELECT 'topic'::text,
      ts_rank(to_tsvector('english', t.name || ' ' || coalesce(t.description, '')), query.q),
      jsonb_build_object('slug', t.slug, 'name', t.name, 'description', t.description)
    FROM public.topics t, query
    WHERE t.active AND to_tsvector('english', t.name || ' ' || coalesce(t.description, '')) @@ query.q
  )
  SELECT hits.kind, hits.rank, hits.payload FROM hits ORDER BY hits.rank DESC
  LIMIT greatest(1, least(coalesce(max_results, 20), 100));
$function$;
