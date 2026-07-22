-- Widen content_feedback submission from "admin-approved accounts only" to "any authenticated
-- user, or a fully anonymous reader carrying a lightweight client-generated token." The prior
-- gate (requireSupabaseAuth: auth + profiles.status='approved') was a real access boundary for
-- the rest of the app, but it also happened to be the only spam control on feedback submission —
-- removing it is paired with server-side rate limiting (see submitContentFeedback) so opening the
-- door does not open it to trivial abuse.
--
-- submitted_by_anon_token is NOT a security boundary: it is a client-generated, localStorage-
-- persisted identifier with no server-side verification of uniqueness or ownership. It exists
-- solely so an anonymous reader's own "you already reported this section" check
-- (listMyContentFeedback) has something to key on. A cleared localStorage or a different browser
-- is simply a "new" anonymous submitter — acceptable for that lightweight nicety, never relied on
-- for anything access-controlled.

ALTER TABLE public.content_feedback
  ALTER COLUMN submitted_by DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS submitted_by_anon_token text,
  ADD CONSTRAINT content_feedback_submitter_check
    CHECK (submitted_by IS NOT NULL OR submitted_by_anon_token IS NOT NULL);

CREATE INDEX IF NOT EXISTS content_feedback_anon_token_idx
  ON public.content_feedback (content_item_id, submitted_by_anon_token)
  WHERE submitted_by_anon_token IS NOT NULL;

GRANT INSERT ON public.content_feedback TO anon;

-- A narrow anon SELECT is required for the server-side rate limiter (submitContentFeedback counts
-- recent rows for the calling anon_token before allowing an insert) — without it, "count rows in
-- the last hour" silently fails for exactly the anonymous traffic the rate limit exists to guard,
-- since the anon role otherwise has no SELECT at all on this table. Column-level grant only:
-- never body/category/section_title, so the count query cannot be repurposed to read feedback
-- text. "Already reported this section" for the UI indicator still goes through the
-- listMyContentFeedback server function (service-role client), not this grant — RLS cannot scope
-- rows by anon_token (it isn't a real Postgres session identity), so this grant is intentionally
-- read-only-enough that an unscoped anon SELECT is an acceptable trade, consistent with
-- "submitted_by_anon_token is NOT a security boundary" above.
GRANT SELECT (id, content_item_id, submitted_by_anon_token, created_at)
  ON public.content_feedback TO anon;

DROP POLICY IF EXISTS "feedback select own" ON public.content_feedback;
CREATE POLICY "feedback select own or anon" ON public.content_feedback
  FOR SELECT TO anon, authenticated
  USING (
    (auth.uid() IS NOT NULL AND auth.uid() = submitted_by)
    OR auth.uid() IS NULL
  );

DROP POLICY IF EXISTS "feedback insert own" ON public.content_feedback;
CREATE POLICY "feedback insert own or anon" ON public.content_feedback
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = submitted_by)
    OR (auth.uid() IS NULL AND submitted_by IS NULL AND submitted_by_anon_token IS NOT NULL)
  );
