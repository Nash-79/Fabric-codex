-- Fast path for the "recent published content" query used by the home page, the blogs
-- index, topic pages, and the marquee. Partial index keeps it tiny.
create index if not exists content_items_published_updated_idx
  on public.content_items (updated_at desc)
  where status = 'published' and active = true;

-- Every article page joins content_item_sources by content_item_id and orders by position;
-- this composite index makes it a single index range scan.
create index if not exists content_item_sources_item_pos_idx
  on public.content_item_sources (content_item_id, position);

-- Topic-scoped and capability-scoped content lists (topic pages, capability pages).
create index if not exists content_items_topic_slug_idx
  on public.content_items (topic_slug)
  where status = 'published' and active = true;

create index if not exists content_items_capability_id_idx
  on public.content_items (capability_id)
  where status = 'published' and active = true;