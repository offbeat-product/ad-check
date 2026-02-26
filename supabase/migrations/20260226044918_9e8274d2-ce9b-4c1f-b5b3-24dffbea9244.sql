-- Create audios bucket (public, for n8n access)
INSERT INTO storage.buckets (id, name, public)
VALUES ('audios', 'audios', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload audio files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'audios');

-- Allow public read access
CREATE POLICY "Public read access for audio files"
ON storage.objects FOR SELECT
USING (bucket_id = 'audios');
