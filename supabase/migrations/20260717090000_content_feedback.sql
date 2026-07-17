-- Reader-submitted feedback on published content_items (articles/designs/lessons), plus the
-- structured AI-triage result attached once the feedback-triage agent reviews it. Modeled on the
-- validation_runs/issues pair but reader-facing: raw feedback text is moderation-gated (no public
-- SELECT) since it is unvetted user input, unlike the agent-authored validation issues.
CREATE TABLE public.content_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id uuid NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('factual_error','outdated','unclear','broken_link','missing_citation','other')),
  body text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','triaged','actioned','dismissed')),
  ai_analysis jsonb,
  triaged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.content_feedback TO authenticated;
GRANT ALL ON public.content_feedback TO service_role;
ALTER TABLE public.content_feedback ENABLE ROW LEVEL SECURITY;

-- Submitters can insert their own feedback and see their own submissions (so the UI can show
-- "you already reported this"), but cannot read other users' raw feedback text or the triage
-- state of the queue at large — that's an editorial surface, not public data.
CREATE POLICY "feedback insert own" ON public.content_feedback
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by);
CREATE POLICY "feedback select own" ON public.content_feedback
  FOR SELECT TO authenticated USING (auth.uid() = submitted_by);
CREATE POLICY "feedback admin all" ON public.content_feedback
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX content_feedback_status_idx ON public.content_feedback (status, created_at);
CREATE INDEX content_feedback_item_idx ON public.content_feedback (content_item_id);
