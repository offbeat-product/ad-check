-- ============================================
-- 1. Missing UPDATE/DELETE policies for shared reference tables
-- ============================================

-- clients: UPDATE and DELETE restricted to authenticated users (single-org app)
CREATE POLICY "auth_update_clients"
ON public.clients FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated'::text);

CREATE POLICY "auth_delete_clients"
ON public.clients FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated'::text);

-- products: UPDATE and DELETE restricted to authenticated users
CREATE POLICY "auth_update_products"
ON public.products FOR UPDATE
TO authenticated
USING (auth.role() = 'authenticated'::text);

CREATE POLICY "auth_delete_products"
ON public.products FOR DELETE
TO authenticated
USING (auth.role() = 'authenticated'::text);

-- ============================================
-- 2. share_links: add UPDATE policy (owner only)
-- ============================================
CREATE POLICY "Users update own share links"
ON public.share_links FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = share_links.check_result_id
    AND check_results.user_id = auth.uid()
  )
);

-- ============================================
-- 3. file_versions: add UPDATE and DELETE (owner only via check_results)
-- ============================================
CREATE POLICY "Users update own file_versions"
ON public.file_versions FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = file_versions.check_result_id
    AND check_results.user_id = auth.uid()
  )
);

CREATE POLICY "Users delete own file_versions"
ON public.file_versions FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = file_versions.check_result_id
    AND check_results.user_id = auth.uid()
  )
);

-- ============================================
-- 4. comments: add DELETE policy (author only)
-- ============================================
CREATE POLICY "Users delete own comments"
ON public.comments FOR DELETE
TO authenticated
USING (
  author_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
);

-- ============================================
-- 5. share_links: hide password_hash from SELECT
--    Replace existing SELECT policy to exclude password_hash via view
-- ============================================

-- Drop existing SELECT policy on share_links
DROP POLICY IF EXISTS "Users view own share links" ON public.share_links;

-- Create restrictive SELECT policy that still allows owner access
-- (password_hash is needed by the edge function using service role, not client)
-- We create a view without password_hash for client use
CREATE OR REPLACE VIEW public.share_links_safe
WITH (security_invoker = on) AS
SELECT
  id, check_result_id, token, expires_at,
  allow_download, allow_comment_read, allow_comment_write,
  created_at,
  (password_hash IS NOT NULL) AS has_password
FROM public.share_links;

-- Re-create SELECT on base table - owner can still see (needed for RPC functions)
CREATE POLICY "Users view own share links"
ON public.share_links FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = share_links.check_result_id
    AND check_results.user_id = auth.uid()
  )
);