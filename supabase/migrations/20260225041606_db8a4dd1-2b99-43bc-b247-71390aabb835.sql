
-- 1. Fix correction_patterns: scope SELECT to own user_id
DROP POLICY IF EXISTS "Users can view correction patterns" ON public.correction_patterns;
CREATE POLICY "Users view own correction patterns"
ON public.correction_patterns FOR SELECT
USING (auth.uid() = user_id);

-- Add DELETE policy for correction_patterns
CREATE POLICY "Users delete own correction patterns"
ON public.correction_patterns FOR DELETE
USING (auth.uid() = user_id);

-- 2. Fix file_versions: scope SELECT to check_result owner
DROP POLICY IF EXISTS "Authenticated users can view file_versions" ON public.file_versions;
CREATE POLICY "Users view own file_versions"
ON public.file_versions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = file_versions.check_result_id
      AND check_results.user_id = auth.uid()
  )
);

-- 3. Fix projects: scope to created_by
DROP POLICY IF EXISTS "auth_select_projects" ON public.projects;
CREATE POLICY "Users view own projects"
ON public.projects FOR SELECT
USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "auth_update_projects" ON public.projects;
CREATE POLICY "Users update own projects"
ON public.projects FOR UPDATE
USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "auth_delete_projects" ON public.projects;
CREATE POLICY "Users delete own projects"
ON public.projects FOR DELETE
USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "auth_insert_projects" ON public.projects;
CREATE POLICY "Users insert own projects"
ON public.projects FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- 4. Fix project_files: scope via project ownership
DROP POLICY IF EXISTS "auth_all_project_files" ON public.project_files;

CREATE POLICY "Users view own project_files"
ON public.project_files FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_files.project_id
      AND projects.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = project_files.check_result_id
      AND check_results.user_id = auth.uid()
  )
);

CREATE POLICY "Users insert own project_files"
ON public.project_files FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_files.project_id
      AND projects.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = project_files.check_result_id
      AND check_results.user_id = auth.uid()
  )
);

CREATE POLICY "Users update own project_files"
ON public.project_files FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_files.project_id
      AND projects.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = project_files.check_result_id
      AND check_results.user_id = auth.uid()
  )
);

CREATE POLICY "Users delete own project_files"
ON public.project_files FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_files.project_id
      AND projects.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.check_results
    WHERE check_results.id = project_files.check_result_id
      AND check_results.user_id = auth.uid()
  )
);
