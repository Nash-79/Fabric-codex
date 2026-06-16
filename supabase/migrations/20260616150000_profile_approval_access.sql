-- Profile approval state is access-control data.
-- Users may read their own profile; admins may read all profiles via has_role().

DROP POLICY IF EXISTS "Profiles viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by owner or admin" ON public.profiles;

CREATE POLICY "Profiles viewable by owner or admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
