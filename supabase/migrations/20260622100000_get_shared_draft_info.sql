-- Share which project_file a shared link points at (nullable for legacy links)
ALTER TABLE public.share_links
  ADD COLUMN IF NOT EXISTS file_id uuid REFERENCES public.project_files(id) ON DELETE SET NULL;

-- Shared view draft badge: project_files.version_number based (matches FileReviewPage fetchVersions)
CREATE OR REPLACE FUNCTION public.get_shared_draft_info(p_check_result_id uuid, p_share_token text)
RETURNS TABLE(current_round integer, total_rounds integer, current_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_file_id uuid;
  v_root_id uuid;
  v_version_number integer;
  v_total integer;
  v_display_round integer;
BEGIN
  SELECT sl.file_id
    INTO v_file_id
  FROM public.share_links sl
  WHERE sl.check_result_id = p_check_result_id
    AND sl.token = p_share_token
    AND (sl.expires_at IS NULL OR sl.expires_at > now());

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Legacy links (file_id IS NULL): agreed fallback
  IF v_file_id IS NULL THEN
    current_round := 1;
    total_rounds := 1;
    current_label := '初稿';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(pf.parent_file_id, pf.id), COALESCE(pf.version_number, 1)
    INTO v_root_id, v_version_number
  FROM public.project_files pf
  WHERE pf.id = v_file_id;

  IF NOT FOUND THEN
    current_round := 1;
    total_rounds := 1;
    current_label := '初稿';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
    INTO v_total
  FROM public.project_files pf
  WHERE pf.id = v_root_id OR pf.parent_file_id = v_root_id;

  v_display_round := v_version_number;
  current_round := v_display_round;
  total_rounds := GREATEST(COALESCE(v_total, 1), 1);
  current_label := CASE
    WHEN v_display_round = 1 THEN '初稿'
    ELSE '第' || v_display_round::text || '稿'
  END;

  RETURN NEXT;
END;
$$;
