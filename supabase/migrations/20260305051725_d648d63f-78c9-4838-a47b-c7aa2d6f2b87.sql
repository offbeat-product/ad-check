
-- Fix: Allow workspace members (not just admin) to delete project_files
DROP POLICY IF EXISTS "Users delete project_files" ON public.project_files;

CREATE POLICY "Users delete project_files" ON public.project_files
FOR DELETE USING (
  (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.created_by = auth.uid()))
  OR (EXISTS (SELECT 1 FROM check_results WHERE check_results.id = project_files.check_result_id AND check_results.user_id = auth.uid()))
  OR (get_workspace_role(auth.uid()) = ANY (ARRAY['admin'::text, 'member'::text]))
);
