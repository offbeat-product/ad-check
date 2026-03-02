
-- Fix correction_logs: restrict to workspace members instead of open access
DROP POLICY IF EXISTS "correction_logs_select" ON public.correction_logs;
DROP POLICY IF EXISTS "correction_logs_insert" ON public.correction_logs;
DROP POLICY IF EXISTS "correction_logs_update" ON public.correction_logs;

CREATE POLICY "Workspace members can view correction logs"
ON public.correction_logs FOR SELECT
USING (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can insert correction logs"
ON public.correction_logs FOR INSERT
WITH CHECK (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can update correction logs"
ON public.correction_logs FOR UPDATE
USING (is_workspace_member_accepted(auth.uid()));

-- Fix profiles: restrict SELECT to authenticated users only (not public/anon)
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Ensure reference-files bucket exists with RLS
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('reference-files', 'reference-files', false, 524288000)
ON CONFLICT (id) DO UPDATE SET file_size_limit = 524288000;

-- Storage RLS for reference-files
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Authenticated users can upload reference files' AND polrelid = 'storage.objects'::regclass) THEN
    CREATE POLICY "Authenticated users can upload reference files"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'reference-files');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Authenticated users can view reference files' AND polrelid = 'storage.objects'::regclass) THEN
    CREATE POLICY "Authenticated users can view reference files"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'reference-files');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Authenticated users can delete reference files' AND polrelid = 'storage.objects'::regclass) THEN
    CREATE POLICY "Authenticated users can delete reference files"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'reference-files');
  END IF;
END $$;
