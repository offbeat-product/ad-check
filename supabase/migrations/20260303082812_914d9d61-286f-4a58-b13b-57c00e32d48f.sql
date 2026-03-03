
-- Remove file_versions references from cascade_delete_project_file trigger
CREATE OR REPLACE FUNCTION public.cascade_delete_project_file()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete child file versions (project_files with parent_file_id)
  DELETE FROM public.project_files WHERE parent_file_id = OLD.id;
  
  -- Delete associated check_result (which will cascade via the other trigger)
  IF OLD.check_result_id IS NOT NULL THEN
    DELETE FROM public.check_results WHERE id = OLD.check_result_id;
  END IF;
  
  RETURN OLD;
END;
$function$;

-- Drop file_versions table (0 records, fully migrated to project_files.parent_file_id)
DROP TABLE IF EXISTS public.file_versions;
