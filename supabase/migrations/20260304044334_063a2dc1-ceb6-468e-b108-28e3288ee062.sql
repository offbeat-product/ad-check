
-- Re-create cascade delete triggers that were lost

-- Trigger: when a project_file is deleted, cascade delete child files and associated check_result
CREATE OR REPLACE TRIGGER trigger_cascade_delete_project_file
  BEFORE DELETE ON public.project_files
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_project_file();

-- Trigger: when a check_result is deleted, cascade delete comments, share_links, correction_logs, submission_logs
CREATE OR REPLACE TRIGGER trigger_cascade_delete_check_result
  BEFORE DELETE ON public.check_results
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_check_result();

-- Trigger: auto-update updated_at on check_results
CREATE OR REPLACE TRIGGER trigger_update_check_results_updated_at
  BEFORE UPDATE ON public.check_results
  FOR EACH ROW
  EXECUTE FUNCTION public.update_check_results_updated_at();
