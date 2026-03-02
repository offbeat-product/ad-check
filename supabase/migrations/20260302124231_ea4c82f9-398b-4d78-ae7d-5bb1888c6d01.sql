-- When a check_result is deleted, cascade-delete its child comparison check_results
-- (those linked via parent_check_result_id)
-- Also cascade-delete comments, file_versions, correction_logs, and share_links

CREATE OR REPLACE FUNCTION public.cascade_delete_check_result()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete child comparison check results (recursive via this same trigger)
  DELETE FROM public.check_results WHERE parent_check_result_id = OLD.id;
  
  -- Delete related comments
  DELETE FROM public.comments WHERE check_result_id = OLD.id;
  
  -- Delete related file_versions
  DELETE FROM public.file_versions WHERE check_result_id = OLD.id;
  
  -- Delete related share_links
  DELETE FROM public.share_links WHERE check_result_id = OLD.id;
  
  -- Delete related correction_logs
  DELETE FROM public.correction_logs WHERE check_result_id = OLD.id;
  
  -- Unlink project_files that reference this check_result
  UPDATE public.project_files SET check_result_id = NULL, status = 'uploaded' 
  WHERE check_result_id = OLD.id;
  
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cascade_delete_check_result
BEFORE DELETE ON public.check_results
FOR EACH ROW
EXECUTE FUNCTION public.cascade_delete_check_result();

-- When a project_file is deleted, also delete its associated check_result
CREATE OR REPLACE FUNCTION public.cascade_delete_project_file()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete child file versions
  DELETE FROM public.project_files WHERE parent_file_id = OLD.id;
  
  -- Delete associated check_result (which will cascade via the other trigger)
  IF OLD.check_result_id IS NOT NULL THEN
    DELETE FROM public.check_results WHERE id = OLD.check_result_id;
  END IF;
  
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cascade_delete_project_file
BEFORE DELETE ON public.project_files
FOR EACH ROW
EXECUTE FUNCTION public.cascade_delete_project_file();