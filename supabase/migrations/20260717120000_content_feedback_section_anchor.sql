-- Anchor reader feedback to the specific section a reader was on, instead of only the whole
-- article. section_id is the same heading slug used by the reading view's h2/h3 DOM anchors and
-- ToC (slugifyHeading — see src/lib/heading-utils.ts), so a submission can point at exactly the
-- passage the reader was looking at. Nullable: feedback can still be article-level (e.g. "the
-- whole thing is outdated"). section_title is denormalized so triage/Settings can show a
-- human-readable label without re-parsing body_md.
ALTER TABLE public.content_feedback
  ADD COLUMN section_id text,
  ADD COLUMN section_title text;

CREATE INDEX content_feedback_section_idx
  ON public.content_feedback (content_item_id, section_id);
