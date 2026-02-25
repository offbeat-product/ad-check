-- Allow anonymous/public access to share_links by token for shared view page
CREATE POLICY "public_select_share_links_by_token" ON public.share_links
  FOR SELECT USING (true);

-- Drop the old restrictive SELECT policy if it conflicts
DROP POLICY IF EXISTS "Users can view share links" ON public.share_links;
