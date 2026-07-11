
-- Fix privilege escalation: prevent users from modifying admin-managed status fields
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND status IS NOT DISTINCT FROM (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid())
  AND approved_at IS NOT DISTINCT FROM (SELECT p.approved_at FROM public.profiles p WHERE p.id = auth.uid())
  AND approved_by IS NOT DISTINCT FROM (SELECT p.approved_by FROM public.profiles p WHERE p.id = auth.uid())
  AND suspended_at IS NOT DISTINCT FROM (SELECT p.suspended_at FROM public.profiles p WHERE p.id = auth.uid())
  AND suspended_by IS NOT DISTINCT FROM (SELECT p.suspended_by FROM public.profiles p WHERE p.id = auth.uid())
);

CREATE POLICY "Admins update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix SECURITY DEFINER views by switching to security_invoker
ALTER VIEW public.rss_status_public SET (security_invoker = true);
ALTER VIEW public.source_watcher_status_public SET (security_invoker = true);
