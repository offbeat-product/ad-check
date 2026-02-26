
-- Create storage bucket for reference material files
INSERT INTO storage.buckets (id, name, public)
VALUES ('reference-files', 'reference-files', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can upload
CREATE POLICY "Auth users can upload reference files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'reference-files');

-- Authenticated users can read
CREATE POLICY "Auth users can read reference files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'reference-files');

-- Authenticated users can delete their uploads
CREATE POLICY "Auth users can delete reference files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'reference-files');
