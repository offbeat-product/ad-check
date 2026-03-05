
-- Update get_shared_check_result to return latest in comparison chain
CREATE OR REPLACE FUNCTION public.get_shared_check_result(p_check_result_id uuid, p_share_token text)
RETURNS SETOF check_results
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  latest_id uuid := p_check_result_id;
  next_id uuid;
BEGIN
  -- Verify share link exists
  IF NOT EXISTS (
    SELECT 1 FROM public.share_links
    WHERE check_result_id = p_check_result_id AND token = p_share_token
  ) THEN
    RETURN;
  END IF;

  -- Walk down the comparison chain to find the latest descendant
  LOOP
    SELECT id INTO next_id
    FROM public.check_results
    WHERE parent_check_result_id = latest_id
    ORDER BY comparison_round DESC
    LIMIT 1;

    IF next_id IS NULL THEN
      EXIT;
    END IF;

    latest_id := next_id;
  END LOOP;

  RETURN QUERY SELECT * FROM public.check_results WHERE id = latest_id LIMIT 1;
END;
$$;

-- Create get_shared_comments function for shared view comment fetching
CREATE OR REPLACE FUNCTION public.get_shared_comments(p_check_result_id uuid, p_share_token text)
RETURNS SETOF comments
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.*
  FROM public.comments c
  WHERE c.check_result_id = p_check_result_id
    AND EXISTS (
      SELECT 1 FROM public.share_links sl
      WHERE sl.token = p_share_token
        AND sl.allow_comment_read = true
    )
  ORDER BY c.created_at ASC;
$$;
