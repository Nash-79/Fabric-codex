-- Storage for admin-uploaded HTML source material (WP2.2 follow-on: "add future content as
-- HTML, uploaded" instead of only URL-fetchable sources). Public read like the `diagrams`
-- bucket, so the resulting object URL is stable and citable long-term by the knowledge-curator
-- agent's WebFetch step and by the eventual `sources.url` value — a signed URL would expire and
-- rot the citation. Writes stay admin-only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('source-uploads', 'source-uploads', true, 10485760, ARRAY['text/html'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read source-uploads storage" ON storage.objects;
CREATE POLICY "Public read source-uploads storage" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'source-uploads');

DROP POLICY IF EXISTS "Admin write source-uploads storage" ON storage.objects;
CREATE POLICY "Admin write source-uploads storage" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'source-uploads' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin update source-uploads storage" ON storage.objects;
CREATE POLICY "Admin update source-uploads storage" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'source-uploads' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'source-uploads' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admin delete source-uploads storage" ON storage.objects;
CREATE POLICY "Admin delete source-uploads storage" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'source-uploads' AND public.has_role(auth.uid(), 'admin'));
