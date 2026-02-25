
-- Secure function for loading check_result via a valid share link
-- Only returns data if the check_result_id is associated with a valid, non-expired share link
CREATE OR REPLACE FUNCTION public.get_shared_check_result(p_check_result_id uuid, p_share_token text)
RETURNS SETOF public.check_results
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cr.*
  FROM public.check_results cr
  WHERE cr.id = p_check_result_id
    AND EXISTS (
      SELECT 1 FROM public.share_links sl
      WHERE sl.check_result_id = p_check_result_id
        AND sl.token = p_share_token
    )
  LIMIT 1;
$$;
