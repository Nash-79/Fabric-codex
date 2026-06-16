-- Admin settings, invite/approval lifecycle, and audit events.
-- Privileged transitions are exposed as SECURITY DEFINER RPCs so client code never
-- writes roles or approval state directly.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_status_check CHECK (status IN ('pending', 'approved', 'suspended'));
  END IF;
END $$;

UPDATE public.profiles p
SET status = 'approved',
    approved_at = COALESCE(p.approved_at, now())
WHERE EXISTS (
  SELECT 1 FROM public.user_roles r
  WHERE r.user_id = p.id AND r.role = 'admin'
);

CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  intended_role public.app_role NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT user_invitations_status_check CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);
CREATE INDEX IF NOT EXISTS user_invitations_email_idx ON public.user_invitations(lower(email));
CREATE INDEX IF NOT EXISTS user_invitations_status_idx ON public.user_invitations(status);
GRANT SELECT ON public.user_invitations TO authenticated;
GRANT ALL ON public.user_invitations TO service_role;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read invitations" ON public.user_invitations;
CREATE POLICY "Admins read invitations" ON public.user_invitations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL DEFAULT '',
  target_id text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_events_actor_idx ON public.admin_audit_events(actor_id);
CREATE INDEX IF NOT EXISTS admin_audit_events_created_idx ON public.admin_audit_events(created_at DESC);
GRANT SELECT ON public.admin_audit_events TO authenticated;
GRANT ALL ON public.admin_audit_events TO service_role;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read audit events" ON public.admin_audit_events;
CREATE POLICY "Admins read audit events" ON public.admin_audit_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.current_user_has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), _role)
$$;

CREATE OR REPLACE FUNCTION public.admin_record_event(
  _action text,
  _target_type text DEFAULT '',
  _target_id text DEFAULT '',
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.admin_audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), _action, _target_type, _target_id, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _event_id;

  RETURN _event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_roles(
  _user_id uuid,
  _roles public.app_role[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.app_role;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;
  IF _roles IS NULL OR array_length(_roles, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one role is required';
  END IF;
  IF _user_id = auth.uid() AND NOT ('admin' = ANY(_roles)) THEN
    RAISE EXCEPTION 'Admins cannot remove their own admin role';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  FOREACH _role IN ARRAY _roles LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.admin_audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    'user.roles_changed',
    'user',
    _user_id::text,
    jsonb_build_object('roles', _roles)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_user(
  _user_id uuid,
  _roles public.app_role[] DEFAULT ARRAY['user']::public.app_role[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  INSERT INTO public.profiles (id, status, approved_at, approved_by)
  VALUES (_user_id, 'approved', now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
    SET status = 'approved',
        approved_at = now(),
        approved_by = auth.uid(),
        suspended_at = NULL,
        suspended_by = NULL,
        updated_at = now();

  PERFORM public.admin_set_user_roles(_user_id, COALESCE(_roles, ARRAY['user']::public.app_role[]));

  INSERT INTO public.admin_audit_events (actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    'user.approved',
    'user',
    _user_id::text,
    jsonb_build_object('roles', COALESCE(_roles, ARRAY['user']::public.app_role[]))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Admins cannot suspend themselves';
  END IF;

  UPDATE public.profiles
  SET status = 'suspended',
      suspended_at = now(),
      suspended_by = auth.uid(),
      updated_at = now()
  WHERE id = _user_id;

  DELETE FROM public.user_roles WHERE user_id = _user_id;

  INSERT INTO public.admin_audit_events (actor_id, action, target_type, target_id)
  VALUES (auth.uid(), 'user.suspended', 'user', _user_id::text);
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_event(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_user(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_record_event(text, text, text, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_roles(uuid, public.app_role[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_approve_user(uuid, public.app_role[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_suspend_user(uuid) FROM anon, PUBLIC;
