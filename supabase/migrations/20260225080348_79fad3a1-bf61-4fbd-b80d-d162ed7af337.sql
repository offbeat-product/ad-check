-- Drop the overly permissive SELECT policy on comment-attachments
DROP POLICY IF EXISTS "Auth users view own comment attachments" ON storage.objects;

-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can upload comment attachments" ON storage.objects;

-- Create path-based ownership policies
-- Upload path format: {user_id}/{check_result_id}/{timestamp}.{ext}
CREATE POLICY "Users upload own comment attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'comment-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users view own comment attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'comment-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own comment attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'comment-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);