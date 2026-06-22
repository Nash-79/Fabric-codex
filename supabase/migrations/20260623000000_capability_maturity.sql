-- Capability maturity: preview vs GA on the registry spine.
--
-- Microsoft Fabric ships features as Public Preview, then Generally Available, and occasionally
-- deprecates them. The capability registry is the spine of Atlas, so maturity belongs there as a
-- first-class, queryable field rather than as a free-form tag. Topics and blogs roll up their
-- maturity from the capabilities they link to (via topic_capabilities) — no per-row maturity is
-- stored on them. Idempotent and re-runnable.

ALTER TABLE public.capabilities
  ADD COLUMN IF NOT EXISTS maturity text NOT NULL DEFAULT 'ga';

ALTER TABLE public.capabilities
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'capabilities_maturity_check'
  ) THEN
    ALTER TABLE public.capabilities
      ADD CONSTRAINT capabilities_maturity_check
      CHECK (maturity IN ('preview', 'ga', 'deprecated'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS capabilities_maturity_idx ON public.capabilities(maturity);

-- RLS unchanged: existing "Capabilities public read" + "Admins write capabilities" policies cover
-- the new columns. Public read so the registry dashboard and blog maturity rollup work for anon.
