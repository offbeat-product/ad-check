
-- Fix file_versions INSERT: scope to owner of the check_result
DROP POLICY IF EXISTS "Authenticated users can insert file_versions" ON public.file_versions;
CREATE POLICY "Users insert file_versions on own check_results"
ON public.file_versions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = file_versions.check_result_id
      AND check_results.user_id = auth.uid()
  )
);

-- Fix share_links DELETE: scope to owner of the check_result
DROP POLICY IF EXISTS "Users can delete own share links" ON public.share_links;
CREATE POLICY "Users delete own share links"
ON public.share_links FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = share_links.check_result_id
      AND check_results.user_id = auth.uid()
  )
);

-- Fix share_links INSERT: scope to owner of the check_result
DROP POLICY IF EXISTS "Users can insert share links" ON public.share_links;
CREATE POLICY "Users insert own share links"
ON public.share_links FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = share_links.check_result_id
      AND check_results.user_id = auth.uid()
  )
);
