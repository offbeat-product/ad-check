
-- Allow workspace admins to update any profile (for role changes, deactivation)
CREATE POLICY "Workspace admins can update profiles"
ON public.profiles
FOR UPDATE
USING (get_workspace_role(auth.uid()) = 'admin');
