-- Make the watcher's read-before-insert dedupe safe under concurrent polls.
-- Keep a claimed item ahead of a queued item, then the oldest item, and dismiss
-- only redundant open copies before installing the database backstop.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY url
           ORDER BY CASE status WHEN 'claimed' THEN 0 ELSE 1 END, created_at, id
         ) AS duplicate_rank
  FROM public.queue_items
  WHERE status IN ('queued', 'claimed')
    AND COALESCE(kind, 'source') = 'source'
), duplicates AS (
  SELECT id FROM ranked WHERE duplicate_rank > 1
)
UPDATE public.queue_items AS queue
SET status = 'dismissed',
    notes = concat_ws(E'\n', NULLIF(queue.notes, ''), 'Duplicate open source URL dismissed automatically.')
FROM duplicates
WHERE queue.id = duplicates.id;

CREATE UNIQUE INDEX IF NOT EXISTS queue_items_one_open_source_url
  ON public.queue_items (url)
  WHERE status IN ('queued', 'claimed')
    AND COALESCE(kind, 'source') = 'source';
