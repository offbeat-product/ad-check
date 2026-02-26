
-- Create public deliverables bucket for styleframe/storyboard images
INSERT INTO storage.buckets (id, name, public)
VALUES ('deliverables', 'deliverables', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "auth_insert_deliverables" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'deliverables');

-- Public read access (for n8n webhook to download)
CREATE POLICY "public_select_deliverables" ON storage.objects
FOR SELECT
USING (bucket_id = 'deliverables');

-- Allow authenticated users to update (upsert)
CREATE POLICY "auth_update_deliverables" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'deliverables');
