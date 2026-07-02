-- Fabric public roadmap, synced verbatim from https://www.fabric-gps.com/rss.
--
-- Distinct from rss_subscriptions/claims: this is a single authoritative, already-structured
-- feed (status, release type, target date) that we sync directly — never routed through the
-- knowledge-curator extraction pipeline, and never paraphrased or embellished. Keeps faith with
-- the repo rule "never invent product limits, quotas, or roadmap claims": every row here is a
-- verbatim mirror of what Microsoft's own roadmap site published, nothing inferred.
--
-- Public-readable (unlike admin-only rss_subscriptions) since the roadmap is a public-facing
-- page. Sync itself is admin-triggered ("Poll now" in Settings → Roadmap), mirroring the RSS
-- feed pattern — there is no unattended cron in this app yet.

CREATE TABLE IF NOT EXISTS public.roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guid text NOT NULL UNIQUE,
  title text NOT NULL,
  link text NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  release_type text NOT NULL DEFAULT '',
  target_release text NOT NULL DEFAULT '',
  categories text[] NOT NULL DEFAULT '{}',
  description_html text NOT NULL DEFAULT '',
  pub_date timestamptz,
  capability_id text REFERENCES public.capabilities(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roadmap_items_status_check CHECK (status IN ('planned', 'rolling_out', 'launched'))
);

CREATE INDEX IF NOT EXISTS roadmap_items_status_idx ON public.roadmap_items(status);
CREATE INDEX IF NOT EXISTS roadmap_items_pub_date_idx ON public.roadmap_items(pub_date DESC);

GRANT SELECT ON public.roadmap_items TO anon, authenticated;
GRANT ALL ON public.roadmap_items TO service_role;
ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read roadmap items" ON public.roadmap_items;
CREATE POLICY "Public read roadmap items" ON public.roadmap_items
  FOR SELECT TO anon, authenticated
  USING (true);

DROP TRIGGER IF EXISTS touch_roadmap_items ON public.roadmap_items;
CREATE TRIGGER touch_roadmap_items
  BEFORE UPDATE ON public.roadmap_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Single-row sync bookkeeping: the feed URL is fixed, so this isn't a subscription list, just
-- last-poll status for the Settings panel.
CREATE TABLE IF NOT EXISTS public.roadmap_sync_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_polled_at timestamptz,
  error_count int NOT NULL DEFAULT 0,
  last_error text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.roadmap_sync_state (id) VALUES (true) ON CONFLICT DO NOTHING;

GRANT SELECT ON public.roadmap_sync_state TO authenticated;
GRANT ALL ON public.roadmap_sync_state TO service_role;
ALTER TABLE public.roadmap_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read roadmap sync state" ON public.roadmap_sync_state;
CREATE POLICY "Admins read roadmap sync state" ON public.roadmap_sync_state
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS touch_roadmap_sync_state ON public.roadmap_sync_state;
CREATE TRIGGER touch_roadmap_sync_state
  BEFORE UPDATE ON public.roadmap_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
