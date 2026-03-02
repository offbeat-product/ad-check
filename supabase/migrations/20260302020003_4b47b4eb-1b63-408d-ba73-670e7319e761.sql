-- Allow workspace members to insert check_results
CREATE POLICY "Workspace members can insert check_results"
ON public.check_results
FOR INSERT
TO authenticated
WITH CHECK (is_workspace_member_accepted(auth.uid()));

-- Allow workspace members to update check_results
CREATE POLICY "Workspace members can update check_results"
ON public.check_results
FOR UPDATE
TO authenticated
USING (is_workspace_member_accepted(auth.uid()));

-- Allow workspace members to delete check_results
CREATE POLICY "Workspace members can delete check_results"
ON public.check_results
FOR DELETE
TO authenticated
USING (is_workspace_member_accepted(auth.uid()));