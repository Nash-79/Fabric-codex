-- Server-side learner progress (Phase 1 / WP1.2 of docs/plan/phase-1-curriculum.md).
--
-- Fixes D3: progress today lives only in three localStorage keys (fa:lesson-done,
-- fa:read:{kind}:{slug}, fa:steps:{kind}:{slug}) -- per-device, wiped on cache clear, no
-- cross-device continuity. Decision (user, 2026-08-23): anonymous-first with optional sign-in.
-- Public reading does not change; this table is additive, read/written only for signed-in users,
-- and the three localStorage keys remain the anonymous path (see use-progress-sync.ts).
--
-- Keyed by slug, not content_item_id -- content_items is versioned (supersedes_id chain, id
-- changes on republish), same reasoning as path_items/prerequisite_ids in
-- 20260823153000_learning_paths.sql. A slug survives republish; an id does not.

CREATE TABLE public.user_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_kind text NOT NULL CHECK (content_kind IN ('article', 'design', 'lesson')),
  content_slug text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  percent int NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_kind, content_slug)
);

CREATE INDEX user_progress_user_idx ON public.user_progress (user_id);

-- Per-user pattern already used by favorites: no admin/service-role split needed here, the owning
-- user reads and writes their own rows directly (through requireSupabaseAuth's request-scoped
-- client, same as toggleFavorite/listMyFavorites in atlas.functions.ts).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_progress TO authenticated;
GRANT ALL ON public.user_progress TO service_role;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own progress" ON public.user_progress
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
