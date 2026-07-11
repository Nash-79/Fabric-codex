-- Restore anon readability of watcher status (broken when the views were switched to
-- security_invoker=true while source_watchers RLS stayed admin-only: anon reads silently
-- returned zero rows, so local tooling reported "0 active" feeds). Watcher rows hold no
-- secrets — public URLs, scope config, and truncated error diagnostics (challenge bodies
-- are never stored) — so a permissive SELECT policy is safe and keeps the views
-- lint-clean as security_invoker.
CREATE POLICY "Public read source watchers" ON public.source_watchers
  FOR SELECT TO anon, authenticated USING (true);

-- Local pollers dedupe against already-seen items (canonical URLs + fingerprints only).
CREATE POLICY "Public read source watcher items" ON public.source_watcher_items
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.source_watchers, public.source_watcher_items TO anon, authenticated;

-- Expose the fields a local poller needs: the feed endpoint (alternative_url), scope
-- config, and the anti-bot diagnostics already shown in the admin UI.
DROP VIEW IF EXISTS public.source_watcher_status_public;
CREATE VIEW public.source_watcher_status_public
WITH (security_invoker = true) AS
SELECT id, title, url, alternative_url, mode, detected_mode, status,
       allowed_host, allowed_path_prefix, max_pages, default_tier, default_tags,
       last_attempt_at, last_success_at, error_count, last_error_code, last_error,
       last_error_trigger, suggested_url
FROM public.source_watchers;

GRANT SELECT ON public.source_watcher_status_public TO anon, authenticated;
