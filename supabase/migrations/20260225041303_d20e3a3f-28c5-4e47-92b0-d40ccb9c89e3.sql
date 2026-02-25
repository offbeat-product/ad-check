
-- Replace the overly permissive SELECT policy with ownership-scoped one
DROP POLICY IF EXISTS "public_select_share_links_by_token" ON public.share_links;

-- Authenticated users can view their own share links (via check_result ownership)
CREATE POLICY "Users view own share links"
ON public.share_links FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = share_links.check_result_id
      AND check_results.user_id = auth.uid()
  )
);

-- Secure function for public token lookup (used by SharedViewPage for unauthenticated access)
CREATE OR REPLACE FUNCTION public.get_share_link_by_token(token_param text)
RETURNS TABLE (
  id uuid,
  check_result_id uuid,
  password_hash text,
  token text,
  expires_at timestamptz,
  allow_download boolean,
  allow_comment_read boolean,
  allow_comment_write boolean,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, check_result_id, password_hash, token, expires_at,
         allow_download, allow_comment_read, allow_comment_write, created_at
  FROM public.share_links
  WHERE share_links.token = token_param
  LIMIT 1;
$$;
