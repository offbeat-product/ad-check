
CREATE OR REPLACE FUNCTION public.delete_project_cascade(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cr_ids uuid[];
  file_ids uuid[];
BEGIN
  -- Collect file IDs
  SELECT array_agg(id) INTO file_ids FROM project_files WHERE project_id = p_project_id;
  
  -- Collect check_result IDs from project files
  SELECT array_agg(check_result_id) INTO cr_ids 
  FROM project_files 
  WHERE project_id = p_project_id AND check_result_id IS NOT NULL;

  -- Unlink check_result_id from project_files to prevent trigger conflicts
  UPDATE project_files SET check_result_id = NULL WHERE project_id = p_project_id;
  
  -- Delete child files (versions) first, then parent files
  DELETE FROM project_files WHERE parent_file_id = ANY(COALESCE(file_ids, '{}'::uuid[]));
  DELETE FROM project_files WHERE project_id = p_project_id;
  
  -- Now safely delete check_results (cascade trigger won't find project_files to update)
  IF cr_ids IS NOT NULL THEN
    -- Also delete child comparison check_results
    DELETE FROM check_results WHERE parent_check_result_id = ANY(cr_ids);
    DELETE FROM check_results WHERE id = ANY(cr_ids);
  END IF;

  -- Delete other related data
  DELETE FROM project_processes WHERE project_id = p_project_id;
  DELETE FROM project_members WHERE project_id = p_project_id;
  DELETE FROM patterns WHERE project_id = p_project_id;
  DELETE FROM correction_logs WHERE project_id = p_project_id;
  DELETE FROM submission_logs WHERE project_id = p_project_id;
  DELETE FROM rule_candidates WHERE project_id = p_project_id;
  
  -- Finally delete the project
  DELETE FROM projects WHERE id = p_project_id;
END;
$$;
