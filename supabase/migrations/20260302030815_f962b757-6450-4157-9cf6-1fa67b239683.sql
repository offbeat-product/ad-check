
-- Drop the problematic policies that reference auth.users directly
DROP POLICY IF EXISTS "Users delete own comments" ON public.comments;
DROP POLICY IF EXISTS "Users update own comments" ON public.comments;

-- Recreate using profiles table instead of auth.users
CREATE POLICY "Users delete own comments"
ON public.comments FOR DELETE
USING (
  author_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Users update own comments"
ON public.comments FOR UPDATE
USING (
  author_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
)
WITH CHECK (
  author_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
);
