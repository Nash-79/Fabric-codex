-- System settings and credentials storage for admin-configured API keys and AI providers.
-- Values are protected by RLS: only admins can select, insert, update, or delete.

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  is_secret BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin select system_settings" ON public.system_settings;
CREATE POLICY "Admin select system_settings" ON public.system_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin insert system_settings" ON public.system_settings;
CREATE POLICY "Admin insert system_settings" ON public.system_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin update system_settings" ON public.system_settings;
CREATE POLICY "Admin update system_settings" ON public.system_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Admin delete system_settings" ON public.system_settings;
CREATE POLICY "Admin delete system_settings" ON public.system_settings
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));