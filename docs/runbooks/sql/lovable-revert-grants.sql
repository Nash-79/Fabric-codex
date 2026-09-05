-- ============================================================================
--  PART 3 -- REVERT.  Run in the LOVABLE project AFTER the export is verified.
--  Undoes everything the export script granted. Safe to run more than once.
-- ============================================================================

-- Drop the temporary read policies (named, so nothing else is touched)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'system_settings','user_roles','profiles','queue_items','admin_audit_events',
    'favorites','content_feedback','seed_runs','rss_subscriptions',
    'source_watchers','source_watcher_items','roadmap_sync_state',
    'learning_paths','path_items','user_progress','user_invitations','assets'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS tmp_export_read ON public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Revoke the anon SELECT added in part 2 for the admin-gated tables.
-- 'assets' is deliberately NOT revoked: it is public-read by design
-- ("Assets are public" policy), so it already had this grant.
REVOKE SELECT ON public.system_settings      FROM anon;
REVOKE SELECT ON public.user_roles           FROM anon;
REVOKE SELECT ON public.queue_items          FROM anon;
REVOKE SELECT ON public.admin_audit_events   FROM anon;
REVOKE SELECT ON public.favorites            FROM anon;
REVOKE SELECT ON public.content_feedback     FROM anon;
REVOKE SELECT ON public.seed_runs            FROM anon;
REVOKE SELECT ON public.rss_subscriptions    FROM anon;
REVOKE SELECT ON public.source_watchers      FROM anon;
REVOKE SELECT ON public.source_watcher_items FROM anon;
REVOKE SELECT ON public.roadmap_sync_state   FROM anon;
REVOKE SELECT ON public.learning_paths       FROM anon;
REVOKE SELECT ON public.path_items           FROM anon;
REVOKE SELECT ON public.user_progress        FROM anon;
REVOKE SELECT ON public.user_invitations     FROM anon;
REVOKE SELECT ON public.profiles             FROM anon;

-- The part 1 grants (claimevents / issues / validation_runs) are intentionally
-- LEFT IN PLACE: your own migrations already declare them, and all three are
-- public-read by policy. The old DB had simply drifted from the repo.
-- To revert them anyway, uncomment:
-- REVOKE SELECT ON public.claimevents     FROM anon;
-- REVOKE SELECT ON public.issues          FROM anon;
-- REVOKE SELECT ON public.validation_runs FROM anon;

-- Confirm nothing temporary is left behind (expect 0 rows)
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname='public' AND policyname='tmp_export_read';
