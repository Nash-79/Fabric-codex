-- Restore anon readability of the ingestion queue (broken the same way as the watchers:
-- 20260705153157 switched queue_public to security_invoker while queue_items RLS stayed
-- admin/owner-only, so anon reads silently returned zero rows and local tooling reported
-- "0 source(s)" even with queued/claimed items waiting). Mirrors the watcher fix in
-- 20260711150000_watcher_public_read_local_poll.sql.
--
-- Exposure is limited to exactly what queue_public already selects: column-level GRANT
-- (no submitted_by, error, or result_source_id) and a row policy scoped to the view's
-- open statuses (no ingested/dismissed history).
DROP POLICY IF EXISTS "Public read open queue items" ON public.queue_items;
CREATE POLICY "Public read open queue items" ON public.queue_items
  FOR SELECT TO anon, authenticated
  USING (status IN ('queued', 'claimed', 'failed'));

GRANT SELECT (id, kind, url, title, tier, tags, notes, target_slug,
              scheduled_at, status, created_at, claimed_at)
  ON public.queue_items TO anon, authenticated;
