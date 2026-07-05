
-- 1) Restrict seed_runs SELECT to admins
DROP POLICY IF EXISTS "seed_runs readable by all" ON public.seed_runs;
CREATE POLICY "Admins can view seed_runs"
  ON public.seed_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) Convert SECURITY DEFINER views to security_invoker
ALTER VIEW public.queue_public SET (security_invoker = on);
ALTER VIEW public.rss_status_public SET (security_invoker = on);

-- 3) Remove broad SELECT (listing) policy on diagrams bucket;
--    public URL reads on public buckets keep working without an RLS SELECT policy.
DROP POLICY IF EXISTS "Public read diagrams storage" ON storage.objects;

-- 4) Admin-only write policies on diagrams bucket
DROP POLICY IF EXISTS "Admins can upload diagrams" ON storage.objects;
CREATE POLICY "Admins can upload diagrams"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'diagrams' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can update diagrams" ON storage.objects;
CREATE POLICY "Admins can update diagrams"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'diagrams' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'diagrams' AND public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins can delete diagrams" ON storage.objects;
CREATE POLICY "Admins can delete diagrams"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'diagrams' AND public.has_role(auth.uid(), 'admin'::public.app_role));
