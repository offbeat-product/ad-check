-- Fix: The comments UPDATE policy is RESTRICTIVE, which blocks all updates
-- because there's no PERMISSIVE UPDATE policy. Drop and recreate as PERMISSIVE.

DROP POLICY IF EXISTS "Users update own comments" ON public.comments;

CREATE POLICY "Users update own comments"
ON public.comments
FOR UPDATE
TO authenticated
USING (
  author_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
)
WITH CHECK (
  author_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
);