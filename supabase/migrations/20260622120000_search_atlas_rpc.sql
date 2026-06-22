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
      'blog'::text AS kind,
      ts_rank(
        to_tsvector('english', b.title || ' ' || coalesce(b.summary, '') || ' ' || coalesce(b.body_md, '')),
        query.q
      ) AS rank,
      jsonb_build_object(
        'slug', b.slug,
        'title', b.title,
        'summary', b.summary
      ) AS payload
    FROM public.blogs b, query
    WHERE b.active
      AND b.status = 'published'
      AND to_tsvector('english', b.title || ' ' || coalesce(b.summary, '') || ' ' || coalesce(b.body_md, '')) @@ query.q

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
