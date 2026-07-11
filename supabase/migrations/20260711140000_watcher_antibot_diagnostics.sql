-- Persist safe anti-bot diagnostics for the admin UI. Never store challenge bodies.
ALTER TABLE public.source_watchers
  ADD COLUMN last_error_trigger text,
  ADD COLUMN suggested_url text;
