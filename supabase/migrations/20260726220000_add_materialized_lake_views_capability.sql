-- Add the Materialized Lake Views capability (GA March 2026): a distinct architecture
-- (declarative SELECT/PySpark transforms, dependency-graph resolution, scheduled/
-- incremental refresh, in-place REPLACE, built-in data-quality enforcement) currently
-- only covered as passing mentions inside lakehouse/spark/dataflow-gen2/data-factory
-- articles, with no dedicated capability node.
INSERT INTO public.capabilities (id, name) VALUES
  ('materialized-lake-views', 'Materialized Lake Views')
ON CONFLICT (id) DO NOTHING;
