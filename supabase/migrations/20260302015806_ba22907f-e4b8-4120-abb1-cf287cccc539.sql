-- Allow workspace members to view all check_results
CREATE POLICY "Workspace members can view check_results"
ON public.check_results
FOR SELECT
TO authenticated
USING (is_workspace_member_accepted(auth.uid()));