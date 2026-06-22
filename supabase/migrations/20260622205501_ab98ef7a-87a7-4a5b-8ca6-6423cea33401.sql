ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'source';
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS target_slug text;
ALTER TABLE public.queue_items ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
CREATE INDEX IF NOT EXISTS queue_items_kind_status_idx ON public.queue_items(kind, status);