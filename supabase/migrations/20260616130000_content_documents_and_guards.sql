-- Versioned-document audit columns + one-active-version guardrails.
--
-- The captured content lives in git as content/*.json (the versioned document of record) and is
-- replayed into normalized tables by the FastAPI backend, which owns versioning/drift/merge
-- (services.py: ingest_source / detect_drift / supersede_claim). This migration ADDS, per content
-- row, a raw `document` jsonb snapshot + `content_hash` so the DB itself carries an auditable,
-- diff-able copy of exactly what was imported — without moving any versioning logic into the DB.
--
-- It also adds DB-level GUARDRAILS (hybrid model): the application drives versioning, but a partial
-- unique index makes it impossible to leave two ACTIVE rows sharing a slug, regardless of writer.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS. Safe to re-run.

-- ---------------------------------------------------------------- raw document snapshots
-- The full captured JSON for the row (claims + diagram refs + cited keys), for audit/diff.
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS document jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.blogs   ADD COLUMN IF NOT EXISTS document jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS document jsonb NOT NULL DEFAULT '{}'::jsonb;

-- content_hash: sources already has it (unify migration). Add to blogs/designs so a re-import of an
-- identical document is a cheap no-op and a changed one is detectable.
ALTER TABLE public.blogs   ADD COLUMN IF NOT EXISTS content_hash text NOT NULL DEFAULT '';
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS content_hash text NOT NULL DEFAULT '';

-- ---------------------------------------------------------------- one-active-version guardrails
-- blogs supersede in place: the prior row is deactivated AND its slug suffixed (@vN) before a new
-- active row reuses the slug (services.create_blog). The base UNIQUE(slug) permits that history;
-- this partial index additionally guarantees at most ONE active row per slug at any time.
CREATE UNIQUE INDEX IF NOT EXISTS blogs_one_active_slug
  ON public.blogs (slug) WHERE active;

-- sources are one row per slug (drift updates in place), already enforced by UNIQUE(slug) + the
-- backend keeping a single active row; no extra partial index needed.
-- designs.slug is globally UNIQUE and designs do not currently supersede, so a partial-active index
-- would be redundant; omitted intentionally to avoid conflicting semantics.

-- ---------------------------------------------------------------- designs updated_at upkeep
-- blogs/queue_items/lessons already have a touch_updated_at BEFORE UPDATE trigger; designs may not.
ALTER TABLE public.designs ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DROP TRIGGER IF EXISTS designs_touch ON public.designs;
CREATE TRIGGER designs_touch BEFORE UPDATE ON public.designs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
