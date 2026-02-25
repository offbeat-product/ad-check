
-- ============================================================
-- FIX 1: Comments RLS — scope to check_result ownership
-- ============================================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON public.comments;
DROP POLICY IF EXISTS "Authenticated users can update comments" ON public.comments;

-- SELECT: user owns the check_result OR comment is on a shared link (public access via share token handled separately)
CREATE POLICY "Users view comments on own check_results"
  ON public.comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.check_results
      WHERE check_results.id = comments.check_result_id
      AND check_results.user_id = auth.uid()
    )
  );

-- INSERT: user owns the check_result
CREATE POLICY "Users insert comments on own check_results"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.check_results
      WHERE check_results.id = comments.check_result_id
      AND check_results.user_id = auth.uid()
    )
  );

-- UPDATE: user is the comment author (matched by email)
CREATE POLICY "Users update own comments"
  ON public.comments FOR UPDATE
  TO authenticated
  USING (author_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- ============================================================
-- FIX 2: Storage — make comment-attachments bucket private
-- ============================================================

-- Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'comment-attachments';

-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Anyone can view comment attachments" ON storage.objects;

-- Authenticated users can view attachments for their own check_results
CREATE POLICY "Auth users view own comment attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'comment-attachments'
    AND auth.role() = 'authenticated'
  );

-- Keep existing INSERT/UPDATE policies as-is (already scoped to authenticated)
