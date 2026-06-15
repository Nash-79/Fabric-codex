
CREATE TABLE public.queue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.queue_items TO authenticated;
GRANT ALL ON public.queue_items TO service_role;
ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users insert own queue items" ON public.queue_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by);
CREATE POLICY "users see own queue items" ON public.queue_items FOR SELECT TO authenticated USING (auth.uid() = submitted_by OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER touch_queue_items BEFORE UPDATE ON public.queue_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  depth text NOT NULL DEFAULT 'L1',
  capability_id text REFERENCES public.capabilities(id) ON DELETE SET NULL,
  body_md text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lessons TO anon, authenticated;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lessons public read" ON public.lessons FOR SELECT USING (true);
CREATE TRIGGER touch_lessons BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text,
  body_md text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.designs TO anon, authenticated;
GRANT ALL ON public.designs TO service_role;
ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "designs public read" ON public.designs FOR SELECT USING (true);
CREATE TRIGGER touch_designs BEFORE UPDATE ON public.designs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.validation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.designs(id) ON DELETE CASCADE,
  score numeric,
  ran_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.validation_runs TO anon, authenticated;
GRANT ALL ON public.validation_runs TO service_role;
ALTER TABLE public.validation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "validation_runs public read" ON public.validation_runs FOR SELECT USING (true);

CREATE TABLE public.issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_run_id uuid NOT NULL REFERENCES public.validation_runs(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.issues TO anon, authenticated;
GRANT ALL ON public.issues TO service_role;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "issues public read" ON public.issues FOR SELECT USING (true);
