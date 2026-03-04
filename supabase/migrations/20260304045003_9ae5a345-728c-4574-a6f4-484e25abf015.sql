
-- Revert: drop AFTER triggers (they won't work with RETURN OLD in the function)
DROP TRIGGER IF EXISTS trigger_cascade_delete_project_file ON public.project_files;
DROP TRIGGER IF EXISTS trigger_cascade_delete_check_result ON public.check_results;

-- Update cascade_delete_project_file to not delete from same table (avoid tuple conflict)
-- Instead, only handle check_result cleanup. Child files will be handled by application code.
CREATE OR REPLACE FUNCTION public.cascade_delete_project_file()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete associated check_result (which will cascade via the other trigger)
  IF OLD.check_result_id IS NOT NULL THEN
    DELETE FROM public.check_results WHERE id = OLD.check_result_id;
  END IF;
  
  RETURN OLD;
END;
$function$;

-- Recreate as BEFORE triggers
CREATE TRIGGER trigger_cascade_delete_project_file
  BEFORE DELETE ON public.project_files
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_project_file();

CREATE TRIGGER trigger_cascade_delete_check_result
  BEFORE DELETE ON public.check_results
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_check_result();
