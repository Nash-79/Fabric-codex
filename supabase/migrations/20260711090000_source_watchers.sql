-- Unified RSS, sitemap, listing-page, and page change monitoring.

CREATE TABLE public.source_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'auto',
  detected_mode text,
  alternative_url text,
  allowed_host text NOT NULL,
  allowed_path_prefix text NOT NULL DEFAULT '/',
  max_depth int NOT NULL DEFAULT 1,
  max_pages int NOT NULL DEFAULT 100,
  default_tier int NOT NULL DEFAULT 6,
  default_tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  error_count int NOT NULL DEFAULT 0,
  last_error_code text,
  last_error text NOT NULL DEFAULT '',
  etag text,
  last_modified text,
  legacy_last_seen_guid text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_watchers_mode_check
    CHECK (mode IN ('auto', 'rss', 'sitemap', 'listing', 'page')),
  CONSTRAINT source_watchers_detected_mode_check
    CHECK (detected_mode IS NULL OR detected_mode IN ('rss', 'sitemap', 'listing', 'page')),
  CONSTRAINT source_watchers_status_check CHECK (status IN ('active', 'paused')),
  CONSTRAINT source_watchers_tier_check CHECK (default_tier BETWEEN 1 AND 6),
  CONSTRAINT source_watchers_depth_check CHECK (max_depth BETWEEN 0 AND 3),
  CONSTRAINT source_watchers_pages_check CHECK (max_pages BETWEEN 1 AND 500)
);

CREATE TABLE public.source_watcher_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watcher_id uuid NOT NULL REFERENCES public.source_watchers(id) ON DELETE CASCADE,
  canonical_url text NOT NULL,
  stable_id text,
  title text NOT NULL DEFAULT '',
  content_fingerprint text NOT NULL,
  last_queued_fingerprint text,
  source_modified_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (watcher_id, canonical_url)
);

INSERT INTO public.source_watchers
  (id, url, title, mode, detected_mode, allowed_host, allowed_path_prefix, default_tier,
   default_tags, status, last_attempt_at, last_success_at, error_count, last_error,
   legacy_last_seen_guid, created_by, created_at, updated_at)
SELECT id, feed_url, title, 'rss', 'rss', lower(split_part(split_part(feed_url, '://', 2), '/', 1)),
       '/', default_tier, default_tags, status, last_polled_at,
       CASE WHEN coalesce(last_error, '') = '' THEN last_polled_at ELSE NULL END,
       error_count, last_error, last_seen_guid, created_by, created_at, updated_at
FROM public.rss_subscriptions
ON CONFLICT (url) DO NOTHING;

CREATE INDEX source_watchers_status_idx ON public.source_watchers(status);
CREATE INDEX source_watcher_items_watcher_idx ON public.source_watcher_items(watcher_id);

GRANT ALL ON public.source_watchers, public.source_watcher_items TO service_role;
ALTER TABLE public.source_watchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_watcher_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read source watchers" ON public.source_watchers
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_source_watchers BEFORE UPDATE ON public.source_watchers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE VIEW public.source_watcher_status_public
WITH (security_invoker = false) AS
SELECT id, title, url, mode, detected_mode, status, default_tier, default_tags,
       last_attempt_at, last_success_at, error_count, last_error_code, last_error
FROM public.source_watchers;

GRANT SELECT ON public.source_watcher_status_public TO anon, authenticated;

-- Compatibility for local queue tooling while it migrates to watcher terminology.
CREATE OR REPLACE VIEW public.rss_status_public
WITH (security_invoker = false) AS
SELECT id, title, url AS feed_url, status, default_tier, default_tags,
       last_attempt_at AS last_polled_at, legacy_last_seen_guid AS last_seen_guid,
       error_count, last_error, created_at, updated_at
FROM public.source_watchers;

GRANT SELECT ON public.rss_status_public TO anon, authenticated;
