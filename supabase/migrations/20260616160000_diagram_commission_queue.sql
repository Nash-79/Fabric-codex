-- Diagram commission queue: reuse queue_items for scheduling diagram work per topic.
--
-- The user wants to commission diagrams for topics at chosen intervals from Settings. Rather than
-- a new table or an unattended cron, we extend the existing queue_items lifecycle
-- (queued -> claimed -> ingested|failed|dismissed) with:
--   kind         — 'source' (ingestion, default) | 'diagram' (commission a diagram)
--   target_slug  — the topic/capability the diagram is for
--   scheduled_at — when the item becomes claimable (null = now); enables "in 1 week / 1 month"
--
-- The local diagram-author agent drains kind='diagram' items, writes the SVG, posts the asset,
-- and marks the item ingested. Generation stays a local-agent step; the server only schedules.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Safe to re-run.

ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'source';
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS target_slug text;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

CREATE INDEX IF NOT EXISTS queue_items_kind_status_idx ON public.queue_items(kind, status);
