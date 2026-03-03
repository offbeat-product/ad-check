
CREATE OR REPLACE FUNCTION public.cascade_delete_check_result()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete child comparison check results (recursive via this same trigger)
  DELETE FROM public.check_results WHERE parent_check_result_id = OLD.id;
  
  -- Delete related comments
  DELETE FROM public.comments WHERE check_result_id = OLD.id;
  
  -- Delete related share_links
  DELETE FROM public.share_links WHERE check_result_id = OLD.id;
  
  -- Delete related correction_logs
  DELETE FROM public.correction_logs WHERE check_result_id = OLD.id;
  
  -- Unlink project_files that reference this check_result
  UPDATE public.project_files SET check_result_id = NULL, status = 'uploaded' 
  WHERE check_result_id = OLD.id;
  
  RETURN OLD;
END;
$function$;
