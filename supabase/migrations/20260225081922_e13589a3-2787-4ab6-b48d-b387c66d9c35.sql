
-- Fix infinite recursion: create security definer function to check membership
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
    AND user_id = p_user_id
    AND status = 'accepted'
  );
$$;

-- Fix projects SELECT policy
DROP POLICY IF EXISTS "Users view own or member projects" ON public.projects;
CREATE POLICY "Users view own or member projects"
ON public.projects FOR SELECT
TO authenticated
USING (
  auth.uid() = created_by
  OR public.is_project_member(id, auth.uid())
);

-- Fix project_files SELECT policy
DROP POLICY IF EXISTS "Users view own or member project_files" ON public.project_files;
CREATE POLICY "Users view own or member project_files"
ON public.project_files FOR SELECT
TO authenticated
USING (
  (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.created_by = auth.uid()))
  OR (EXISTS (SELECT 1 FROM check_results WHERE check_results.id = project_files.check_result_id AND check_results.user_id = auth.uid()))
  OR public.is_project_member(project_files.project_id, auth.uid())
);

-- Fix project_processes SELECT policy
DROP POLICY IF EXISTS "Users view own or member project_processes" ON public.project_processes;
CREATE POLICY "Users view own or member project_processes"
ON public.project_processes FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_processes.project_id AND projects.created_by = auth.uid())
  OR public.is_project_member(project_processes.project_id, auth.uid())
);
