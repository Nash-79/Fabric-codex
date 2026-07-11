-- Watchers always auto-discover. The last successful strategy/endpoint is a performance hint;
-- polling falls back through the full hierarchy whenever that hint stops producing output.
ALTER TABLE public.source_watchers
  ADD COLUMN IF NOT EXISTS detected_url text;

UPDATE public.source_watchers
SET detected_mode = COALESCE(detected_mode, NULLIF(mode, 'auto')),
    detected_url = COALESCE(detected_url, alternative_url, url),
    mode = 'auto';

ALTER TABLE public.source_watchers ALTER COLUMN mode SET DEFAULT 'auto';

DROP VIEW IF EXISTS public.source_watcher_status_public;
CREATE VIEW public.source_watcher_status_public
WITH (security_invoker = true) AS
SELECT id, title, url, alternative_url, mode, detected_mode, detected_url, status,
       allowed_host, allowed_path_prefix, max_depth, max_pages, default_tier, default_tags,
       last_attempt_at, last_success_at, error_count, last_error_code, last_error,
       last_error_trigger, suggested_url, etag, last_modified
FROM public.source_watchers;

GRANT SELECT ON public.source_watcher_status_public TO anon, authenticated;