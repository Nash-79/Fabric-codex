-- Restrict profiles SELECT to authenticated users only
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Revoke public/anon EXECUTE on SECURITY DEFINER functions that should never be called by anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM anon, authenticated, PUBLIC;
-- has_role must remain executable by authenticated because RLS policies call it as the querying user