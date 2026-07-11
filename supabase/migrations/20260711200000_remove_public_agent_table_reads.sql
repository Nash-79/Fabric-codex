-- Local agents now read a sanitized snapshot through GET /api/public/hooks/poll-feeds with a dedicated bearer
-- token. Keep table RLS private and record the Lovable security fix in migration history.
DROP POLICY IF EXISTS "Public read open queue items" ON public.queue_items;
DROP POLICY IF EXISTS "Public read source watchers" ON public.source_watchers;
DROP POLICY IF EXISTS "Public read source watcher items" ON public.source_watcher_items;

REVOKE SELECT ON public.queue_items FROM anon;
REVOKE SELECT (id, kind, url, title, tier, tags, notes, target_slug,
               scheduled_at, status, created_at, claimed_at)
  ON public.queue_items FROM anon;
REVOKE SELECT ON public.source_watchers FROM anon;
REVOKE SELECT ON public.source_watcher_items FROM anon;

COMMENT ON TABLE public.queue_items IS
  'Private workflow state. Local agents use the token-protected application snapshot endpoint.';
COMMENT ON TABLE public.source_watchers IS
  'Private watcher configuration. Local agents use the token-protected application snapshot endpoint.';
COMMENT ON TABLE public.source_watcher_items IS
  'Private watcher dedupe state. Local agents use the token-protected application snapshot endpoint.';
