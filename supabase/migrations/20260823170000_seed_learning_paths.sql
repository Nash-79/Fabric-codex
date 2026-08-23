-- Seeds the initial learning paths (Phase 1 / WP1.3 of docs/plan/phase-1-curriculum.md).
--
-- Per the plan: "Seed paths from real sources, do not invent them." Five paths, all built from
-- content that already exists and is published today (verified against the live content_items
-- table 2026-08-23 — 72 published rows, one article per topic root/child, 15 lessons across 4
-- capability families):
--
--   1. fabric-foundations   -- the 7 root-topic articles, in content/topics.json's own `order`
--                               (roots 1-7: platform, storage, engineering, warehousing, bi,
--                               real-time, ai-apis -- roots 8/9, data-architecture and
--                               solution-patterns, are synthesis topics, not a beginner on-ramp,
--                               so deliberately excluded from the foundation track).
--   2-5. Four capability tracks, one per lesson family that actually has a beginner/intermediate/
--        expert trio today: spark, lakehouse (delta-tables lessons), warehouse (dbt-fabric
--        lessons), fabric-iq. Each also chains into that capability's deepest article as a
--        fourth "keep going" step where one exists and isn't already the lesson's own subject.
--
-- ON CONFLICT DO NOTHING throughout so this migration is safe to re-run.

INSERT INTO public.learning_paths (slug, title, description, audience, sort_order) VALUES
  ('fabric-foundations',
   'Fabric Foundations',
   'A guided first pass across the whole platform -- what each workload is for and how they fit together, before going deep on any one of them.',
   'New to Microsoft Fabric, or evaluating the platform for the first time.',
   1),
  ('spark-track',
   'Spark on Fabric',
   'From your first Spark session to Native Execution Engine internals and the Delta write path.',
   'Data engineers writing or tuning Spark notebooks on Fabric.',
   2),
  ('lakehouse-track',
   'Lakehouse & Delta Tables',
   'How Delta tables work in a Fabric Lakehouse, from your first table to storage internals and maintenance mechanics.',
   'Data engineers designing or maintaining Lakehouse tables.',
   3),
  ('warehouse-dbt-track',
   'dbt on Fabric Warehouse',
   'Running dbt against Fabric, from your first model to adapter mechanics and incremental-run cost.',
   'Analytics engineers adopting dbt on Fabric Warehouse or Lakehouse.',
   4),
  ('fabric-iq-track',
   'Fabric IQ & the Ontology Layer',
   'What the ontology item is, how to architect one, and its open internals.',
   'Architects and engineers building a shared semantic layer for AI agents.',
   5)
ON CONFLICT (slug) DO NOTHING;

-- 1. Fabric Foundations -- one article per root topic, topics.json's own order.
INSERT INTO public.path_items (path_slug, content_kind, content_slug, position) VALUES
  ('fabric-foundations', 'article', 'platform', 1),
  ('fabric-foundations', 'article', 'storage', 2),
  ('fabric-foundations', 'article', 'engineering', 3),
  ('fabric-foundations', 'article', 'warehousing', 4),
  ('fabric-foundations', 'article', 'bi', 5),
  ('fabric-foundations', 'article', 'real-time', 6),
  ('fabric-foundations', 'article', 'ai-apis', 7)
ON CONFLICT (path_slug, content_kind, content_slug) DO NOTHING;

-- 2. Spark track -- three lesson tiers, then the deep-dive article as the "keep going" step.
INSERT INTO public.path_items (path_slug, content_kind, content_slug, position) VALUES
  ('spark-track', 'lesson', 'spark-beginner', 1),
  ('spark-track', 'lesson', 'spark-intermediate', 2),
  ('spark-track', 'lesson', 'spark-expert', 3),
  ('spark-track', 'article', 'spark', 4)
ON CONFLICT (path_slug, content_kind, content_slug) DO NOTHING;

-- 3. Lakehouse track -- delta-tables lessons are capability-scoped to lakehouse, not their own
--    topic, so the deep-dive step is the lakehouse article.
INSERT INTO public.path_items (path_slug, content_kind, content_slug, position) VALUES
  ('lakehouse-track', 'lesson', 'delta-tables-beginner', 1),
  ('lakehouse-track', 'lesson', 'delta-tables-intermediate', 2),
  ('lakehouse-track', 'lesson', 'delta-tables-expert', 3),
  ('lakehouse-track', 'article', 'lakehouse', 4)
ON CONFLICT (path_slug, content_kind, content_slug) DO NOTHING;

-- 4. dbt-on-Fabric-Warehouse track -- dbt-fabric lessons are capability-scoped to warehouse.
INSERT INTO public.path_items (path_slug, content_kind, content_slug, position) VALUES
  ('warehouse-dbt-track', 'lesson', 'dbt-fabric-beginner', 1),
  ('warehouse-dbt-track', 'lesson', 'dbt-fabric-intermediate', 2),
  ('warehouse-dbt-track', 'lesson', 'dbt-fabric-expert', 3),
  ('warehouse-dbt-track', 'article', 'warehouse', 4)
ON CONFLICT (path_slug, content_kind, content_slug) DO NOTHING;

-- 5. Fabric IQ track -- fabric-iq lessons are capability-scoped to fabric-iq; the fabric-iq
--    article itself is the topic's own reference, used here as the closing "keep going" step.
INSERT INTO public.path_items (path_slug, content_kind, content_slug, position) VALUES
  ('fabric-iq-track', 'lesson', 'fabric-iq-beginner', 1),
  ('fabric-iq-track', 'lesson', 'fabric-iq-intermediate', 2),
  ('fabric-iq-track', 'lesson', 'fabric-iq-expert', 3),
  ('fabric-iq-track', 'article', 'fabric-iq', 4)
ON CONFLICT (path_slug, content_kind, content_slug) DO NOTHING;
