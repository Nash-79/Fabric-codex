CREATE OR REPLACE FUNCTION public.atlas_health_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'claims',   (SELECT count(*) FROM public.claims   WHERE active),
    'sources',  (SELECT count(*) FROM public.sources  WHERE active),
    'blogs',    (SELECT count(*) FROM public.blogs    WHERE active),
    'topics',   (SELECT count(*) FROM public.topics   WHERE active),
    'diagrams', (SELECT count(*) FROM public.diagrams),
    'designs',  (SELECT count(*) FROM public.designs),
    'help_docs',(SELECT count(*) FROM public.help_docs)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.atlas_health_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atlas_health_counts() TO anon, authenticated, service_role;