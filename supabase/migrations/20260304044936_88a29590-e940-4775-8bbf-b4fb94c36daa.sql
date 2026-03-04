
-- Drop the BEFORE trigger and recreate as AFTER to avoid "tuple already modified" error
DROP TRIGGER IF EXISTS trigger_cascade_delete_project_file ON public.project_files;

CREATE TRIGGER trigger_cascade_delete_project_file
  AFTER DELETE ON public.project_files
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_project_file();

-- Also fix cascade_delete_check_result to AFTER
DROP TRIGGER IF EXISTS trigger_cascade_delete_check_result ON public.check_results;

CREATE TRIGGER trigger_cascade_delete_check_result
  AFTER DELETE ON public.check_results
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_check_result();
