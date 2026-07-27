-- Phase 1 of the Editorial Experience Revamp: add the typed, constrained presentation
-- contract and lesson pedagogy metadata to content_items. Both are additive, nullable
-- columns -- no backfill needed (existing rows simply have no profile yet, which every
-- consumer must already treat as "no archetype-specific behavior", not an error).

ALTER TABLE public.content_items
  ADD COLUMN presentation_profile jsonb,
  ADD COLUMN lesson_meta jsonb;

-- Constrain archetype at the DB level too (defense in depth -- Zod is the primary gate at
-- write time, this stops any other writer, e.g. a future direct SQL/import path, from
-- inserting an unconstrained value).
ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_presentation_archetype_check
  CHECK (
    presentation_profile IS NULL
    OR presentation_profile ->> 'archetype' IN
       ('explainer','field-guide','tutorial','deep-dive','architecture','lesson')
  );

COMMENT ON COLUMN public.content_items.presentation_profile IS
  'Constrained editorial-presentation contract (archetype/accent/hero/diagram/density/toc/prereqs) -- see src/lib/content-presentation.ts. Never freeform layout strings.';
COMMENT ON COLUMN public.content_items.lesson_meta IS
  'Lesson-only pedagogy metadata (summary/level/estimated_minutes/objectives/prerequisites/completion_outcome) -- see src/lib/content-presentation.ts.';
