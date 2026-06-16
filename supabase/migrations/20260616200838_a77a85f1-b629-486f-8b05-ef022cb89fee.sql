DROP POLICY IF EXISTS "claimevents public read" ON public.claimevents;
CREATE POLICY "Admins read claimevents" ON public.claimevents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE SELECT ON public.claimevents FROM anon;

DROP POLICY IF EXISTS "issues public read" ON public.issues;
CREATE POLICY "Admins read issues" ON public.issues
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE SELECT ON public.issues FROM anon;

DROP POLICY IF EXISTS "validation_runs public read" ON public.validation_runs;
CREATE POLICY "Admins read validation_runs" ON public.validation_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
REVOKE SELECT ON public.validation_runs FROM anon;