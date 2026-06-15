
-- Drop old demo tables
DROP TABLE IF EXISTS public.favorites CASCADE;
DROP TABLE IF EXISTS public.assets CASCADE;
DROP TABLE IF EXISTS public.domains CASCADE;

-- Roles
CREATE TYPE public.app_role AS ENUM ('admin','editor','user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Make the first signed-up user an admin automatically (bootstrap).
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_bootstrap_admin ON auth.users;
CREATE TRIGGER on_auth_user_bootstrap_admin AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_first_admin();

-- Topics
CREATE TABLE public.topics (
  slug text PRIMARY KEY,
  parent_slug text REFERENCES public.topics(slug) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.topics TO anon, authenticated;
GRANT ALL ON public.topics TO service_role;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Topics public read" ON public.topics FOR SELECT USING (true);
CREATE POLICY "Admins write topics" ON public.topics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Capabilities (registry spine)
CREATE TABLE public.capabilities (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  accent text NOT NULL DEFAULT 'teal',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.capabilities TO anon, authenticated;
GRANT ALL ON public.capabilities TO service_role;
ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Capabilities public read" ON public.capabilities FOR SELECT USING (true);
CREATE POLICY "Admins write capabilities" ON public.capabilities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Topic ↔ Capability
CREATE TABLE public.topic_capabilities (
  topic_slug text NOT NULL REFERENCES public.topics(slug) ON DELETE CASCADE,
  capability_id text NOT NULL REFERENCES public.capabilities(id) ON DELETE CASCADE,
  PRIMARY KEY (topic_slug, capability_id)
);
GRANT SELECT ON public.topic_capabilities TO anon, authenticated;
GRANT ALL ON public.topic_capabilities TO service_role;
ALTER TABLE public.topic_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "TC public read" ON public.topic_capabilities FOR SELECT USING (true);
CREATE POLICY "Admins write TC" ON public.topic_capabilities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Sources
CREATE TABLE public.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  url text NOT NULL,
  title text NOT NULL,
  tier int NOT NULL CHECK (tier BETWEEN 1 AND 6),
  tags text[] NOT NULL DEFAULT '{}',
  summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sources TO anon, authenticated;
GRANT ALL ON public.sources TO service_role;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sources public read" ON public.sources FOR SELECT USING (true);
CREATE POLICY "Admins write sources" ON public.sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX sources_tier_idx ON public.sources(tier);
CREATE INDEX sources_search_idx ON public.sources
  USING GIN (to_tsvector('english', title || ' ' || summary));

-- Claims
CREATE TABLE public.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  capability_id text NOT NULL REFERENCES public.capabilities(id) ON DELETE RESTRICT,
  text text NOT NULL,
  depth int NOT NULL CHECK (depth BETWEEN 1 AND 5),
  type text NOT NULL DEFAULT 'fact',
  tags text[] NOT NULL DEFAULT '{}',
  version int NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.claims(id),
  active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'approved',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.claims TO anon, authenticated;
GRANT ALL ON public.claims TO service_role;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Claims public read" ON public.claims FOR SELECT USING (true);
CREATE POLICY "Admins write claims" ON public.claims FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX claims_capability_idx ON public.claims(capability_id) WHERE active;
CREATE INDEX claims_depth_idx ON public.claims(depth) WHERE active;
CREATE INDEX claims_search_idx ON public.claims USING GIN (to_tsvector('english', text));

-- Blogs
CREATE TABLE public.blogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_slug text REFERENCES public.topics(slug) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body_md text NOT NULL DEFAULT '',
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'published',
  validation_confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blogs TO anon, authenticated;
GRANT ALL ON public.blogs TO service_role;
ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Blogs public read" ON public.blogs FOR SELECT USING (true);
CREATE POLICY "Admins write blogs" ON public.blogs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX blogs_search_idx ON public.blogs
  USING GIN (to_tsvector('english', title || ' ' || summary || ' ' || body_md));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER blogs_touch BEFORE UPDATE ON public.blogs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Blog ↔ Source citations
CREATE TABLE public.blog_sources (
  blog_id uuid NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  label text NOT NULL,
  position int NOT NULL DEFAULT 0,
  PRIMARY KEY (blog_id, label)
);
GRANT SELECT ON public.blog_sources TO anon, authenticated;
GRANT ALL ON public.blog_sources TO service_role;
ALTER TABLE public.blog_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "BS public read" ON public.blog_sources FOR SELECT USING (true);
CREATE POLICY "Admins write BS" ON public.blog_sources FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Diagrams
CREATE TABLE public.diagrams (
  slug text PRIMARY KEY,
  topic_slug text REFERENCES public.topics(slug) ON DELETE SET NULL,
  path text NOT NULL,
  caption text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'architecture',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.diagrams TO anon, authenticated;
GRANT ALL ON public.diagrams TO service_role;
ALTER TABLE public.diagrams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Diagrams public read" ON public.diagrams FOR SELECT USING (true);
CREATE POLICY "Admins write diagrams" ON public.diagrams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Help docs
CREATE TABLE public.help_docs (
  slug text PRIMARY KEY,
  title text NOT NULL,
  body_md text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.help_docs TO anon, authenticated;
GRANT ALL ON public.help_docs TO service_role;
ALTER TABLE public.help_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Help public read" ON public.help_docs FOR SELECT USING (true);
CREATE POLICY "Admins write help" ON public.help_docs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Favorites (per user, polymorphic via item_type)
CREATE TABLE public.favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('blog','topic','source','claim')),
  item_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type, item_key)
);
GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fav view own" ON public.favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Fav add own" ON public.favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Fav del own" ON public.favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);
