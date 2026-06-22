-- RSS feed subscriptions: auto-queue new blog posts for ingestion.
--
-- The user wants to subscribe to Microsoft Fabric blogs (e.g. the Fabric Updates Blog) so new
-- posts are queued as kind='source' items automatically. Consistent with the rest of Atlas, the
-- server only STORES subscriptions — it never polls. The local /poll-rss-feeds agent fetches each
-- active feed, dedupes new entries against sources + queue_items, and POSTs them into the existing
-- ingestion queue. From there /ingest-batch extracts cited claims, unchanged.
--
-- Admin-only, mirroring the diagram-commission and CMS admin tables: reads/writes go through the
-- service role from server functions guarded by requireAdmin; RLS denies direct anon/authenticated
-- access. Idempotent and re-runnable.

CREATE TABLE IF NOT EXISTS public.rss_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_url text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  default_tier int NOT NULL DEFAULT 6,
  default_tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  last_polled_at timestamptz,
  last_seen_guid text,
  error_count int NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rss_subscriptions_status_check CHECK (status IN ('active', 'paused')),
  CONSTRAINT rss_subscriptions_tier_check CHECK (default_tier BETWEEN 1 AND 6)
);

CREATE INDEX IF NOT EXISTS rss_subscriptions_status_idx ON public.rss_subscriptions(status);

GRANT SELECT ON public.rss_subscriptions TO authenticated;
GRANT ALL ON public.rss_subscriptions TO service_role;
ALTER TABLE public.rss_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read rss subscriptions" ON public.rss_subscriptions;
CREATE POLICY "Admins read rss subscriptions" ON public.rss_subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS touch_rss_subscriptions ON public.rss_subscriptions;
CREATE TRIGGER touch_rss_subscriptions
  BEFORE UPDATE ON public.rss_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
