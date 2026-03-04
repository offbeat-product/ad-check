
-- Remove the problematic BEFORE DELETE trigger on project_files
-- Application code will handle cascade manually
DROP TRIGGER IF EXISTS trigger_cascade_delete_project_file ON public.project_files;
