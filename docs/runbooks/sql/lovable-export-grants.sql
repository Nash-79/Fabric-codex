-- ============================================================================
--  Run this in the LOVABLE project's SQL editor  (ysgmvtvwrkrxagefkhrc)
--  Purpose: let the anon key read the tables it currently cannot, so the data
--           can be exported to the new self-owned project.
--  This is READ-ONLY exposure, and it is TEMPORARY -- part 3 reverts it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART 1 -- the three missing GRANTs
-- These three GRANT statements already exist in supabase/migrations/, but were
-- never applied to this database (schema drift). This just makes the live DB
-- match what the repo already declares.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.claimevents      TO anon;
GRANT SELECT ON public.issues           TO anon;
GRANT SELECT ON public.validation_runs  TO anon;


-- ---------------------------------------------------------------------------
-- PART 2 -- temporary read policies for the admin-gated tables
-- These return 200 with 0 rows today: the GRANT is fine, RLS is filtering.
-- Each policy is named 'tmp_export_read' so part 3 can drop them cleanly.
--
-- NOTE: system_settings may contain API keys/secrets. It is included because
-- Phase 3 needs the OpenRouter policy, but review what comes out before
-- trusting it, and rotate anything sensitive afterwards.
-- ---------------------------------------------------------------------------
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
      EXECUTE format('CREATE POLICY tmp_export_read ON public.%I FOR SELECT TO anon USING (true)', t);
      EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
    END IF;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- VERIFY -- run this and send me the output. It contains only table names and
-- row counts, no data. This tells me exactly what there is to copy.
-- ---------------------------------------------------------------------------
SELECT 'claimevents' t, count(*) FROM public.claimevents
UNION ALL SELECT 'issues',              count(*) FROM public.issues
UNION ALL SELECT 'validation_runs',     count(*) FROM public.validation_runs
UNION ALL SELECT 'system_settings',     count(*) FROM public.system_settings
UNION ALL SELECT 'user_roles',          count(*) FROM public.user_roles
UNION ALL SELECT 'profiles',            count(*) FROM public.profiles
UNION ALL SELECT 'queue_items',         count(*) FROM public.queue_items
UNION ALL SELECT 'admin_audit_events',  count(*) FROM public.admin_audit_events
UNION ALL SELECT 'assets',              count(*) FROM public.assets
UNION ALL SELECT 'content_feedback',    count(*) FROM public.content_feedback
UNION ALL SELECT 'favorites',           count(*) FROM public.favorites
UNION ALL SELECT 'rss_subscriptions',   count(*) FROM public.rss_subscriptions
UNION ALL SELECT 'source_watchers',     count(*) FROM public.source_watchers
UNION ALL SELECT 'source_watcher_items',count(*) FROM public.source_watcher_items
UNION ALL SELECT 'seed_runs',           count(*) FROM public.seed_runs
UNION ALL SELECT 'roadmap_sync_state',  count(*) FROM public.roadmap_sync_state
UNION ALL SELECT 'learning_paths',      count(*) FROM public.learning_paths
UNION ALL SELECT 'path_items',          count(*) FROM public.path_items
UNION ALL SELECT 'user_progress',       count(*) FROM public.user_progress
UNION ALL SELECT 'user_invitations',    count(*) FROM public.user_invitations
ORDER BY 2 DESC, 1;
