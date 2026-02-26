
-- =============================================
-- Workspace Members: app-wide access control
-- =============================================
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validation trigger for role/status
CREATE OR REPLACE FUNCTION public.validate_workspace_member()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role NOT IN ('admin', 'member', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role: %', NEW.role;
  END IF;
  IF NEW.status NOT IN ('pending', 'accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_workspace_member
BEFORE INSERT OR UPDATE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.validate_workspace_member();

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_members;

-- =============================================
-- Security Definer functions for workspace access
-- =============================================
CREATE OR REPLACE FUNCTION public.is_workspace_member_accepted(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = _user_id AND status = 'accepted'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_role(_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.workspace_members
  WHERE user_id = _user_id AND status = 'accepted'
  LIMIT 1;
$$;

-- =============================================
-- RLS for workspace_members
-- =============================================
CREATE POLICY "Workspace admins can do all" ON public.workspace_members
FOR ALL USING (get_workspace_role(auth.uid()) = 'admin');

CREATE POLICY "Members view own record" ON public.workspace_members
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Pending members can accept/decline" ON public.workspace_members
FOR UPDATE USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =============================================
-- Update project_members: support 3 roles
-- =============================================
UPDATE public.project_members SET role = 'member' WHERE role = 'editor';

-- =============================================
-- Update RLS: include workspace members
-- =============================================

-- Projects: workspace members can view all
DROP POLICY IF EXISTS "Users view own or member projects" ON public.projects;
CREATE POLICY "Users view accessible projects" ON public.projects
FOR SELECT USING (
  auth.uid() = created_by
  OR is_project_member(id, auth.uid())
  OR is_workspace_member_accepted(auth.uid())
);

-- Projects: workspace admin/member can update
DROP POLICY IF EXISTS "Users update own projects" ON public.projects;
CREATE POLICY "Users update accessible projects" ON public.projects
FOR UPDATE USING (
  auth.uid() = created_by
  OR get_workspace_role(auth.uid()) IN ('admin', 'member')
);

-- Projects: workspace admin or owner can delete
DROP POLICY IF EXISTS "Users delete own projects" ON public.projects;
CREATE POLICY "Users delete own or admin projects" ON public.projects
FOR DELETE USING (
  auth.uid() = created_by
  OR get_workspace_role(auth.uid()) = 'admin'
);

-- Projects: workspace admin/member can insert
DROP POLICY IF EXISTS "Users insert own projects" ON public.projects;
CREATE POLICY "Users insert projects" ON public.projects
FOR INSERT WITH CHECK (
  auth.uid() = created_by
  OR get_workspace_role(auth.uid()) IN ('admin', 'member')
);

-- Project processes: workspace members can view
DROP POLICY IF EXISTS "Users view own or member project_processes" ON public.project_processes;
CREATE POLICY "Users view project_processes" ON public.project_processes
FOR SELECT USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_processes.project_id AND projects.created_by = auth.uid())
  OR is_project_member(project_id, auth.uid())
  OR is_workspace_member_accepted(auth.uid())
);

-- Project processes: workspace admin/member can manage
DROP POLICY IF EXISTS "Users insert own project_processes" ON public.project_processes;
CREATE POLICY "Users insert project_processes" ON public.project_processes
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_processes.project_id AND projects.created_by = auth.uid())
  OR get_workspace_role(auth.uid()) IN ('admin', 'member')
);

DROP POLICY IF EXISTS "Users update own project_processes" ON public.project_processes;
CREATE POLICY "Users update project_processes" ON public.project_processes
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_processes.project_id AND projects.created_by = auth.uid())
  OR get_workspace_role(auth.uid()) IN ('admin', 'member')
);

DROP POLICY IF EXISTS "Users delete own project_processes" ON public.project_processes;
CREATE POLICY "Users delete project_processes" ON public.project_processes
FOR DELETE USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_processes.project_id AND projects.created_by = auth.uid())
  OR get_workspace_role(auth.uid()) = 'admin'
);

-- Project files: workspace members can view
DROP POLICY IF EXISTS "Users view own or member project_files" ON public.project_files;
CREATE POLICY "Users view project_files" ON public.project_files
FOR SELECT USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM check_results WHERE check_results.id = project_files.check_result_id AND check_results.user_id = auth.uid())
  OR is_project_member(project_id, auth.uid())
  OR is_workspace_member_accepted(auth.uid())
);

-- Project files: workspace admin/member can manage
DROP POLICY IF EXISTS "Users insert own project_files" ON public.project_files;
CREATE POLICY "Users insert project_files" ON public.project_files
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM check_results WHERE check_results.id = project_files.check_result_id AND check_results.user_id = auth.uid())
  OR get_workspace_role(auth.uid()) IN ('admin', 'member')
);

DROP POLICY IF EXISTS "Users update own project_files" ON public.project_files;
CREATE POLICY "Users update project_files" ON public.project_files
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM check_results WHERE check_results.id = project_files.check_result_id AND check_results.user_id = auth.uid())
  OR get_workspace_role(auth.uid()) IN ('admin', 'member')
);

DROP POLICY IF EXISTS "Users delete own project_files" ON public.project_files;
CREATE POLICY "Users delete project_files" ON public.project_files
FOR DELETE USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM check_results WHERE check_results.id = project_files.check_result_id AND check_results.user_id = auth.uid())
  OR get_workspace_role(auth.uid()) = 'admin'
);

-- Project members: workspace members can view all project memberships
DROP POLICY IF EXISTS "Project owner can select members" ON public.project_members;
CREATE POLICY "View project members" ON public.project_members
FOR SELECT USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.created_by = auth.uid())
  OR user_id = auth.uid()
  OR is_workspace_member_accepted(auth.uid())
);

-- Project members: workspace admin can also manage project members
DROP POLICY IF EXISTS "Project owner can insert members" ON public.project_members;
CREATE POLICY "Insert project members" ON public.project_members
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.created_by = auth.uid())
  OR get_workspace_role(auth.uid()) = 'admin'
);

DROP POLICY IF EXISTS "Project owner can update members" ON public.project_members;
CREATE POLICY "Update project members" ON public.project_members
FOR UPDATE USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.created_by = auth.uid())
  OR user_id = auth.uid()
  OR get_workspace_role(auth.uid()) = 'admin'
);

DROP POLICY IF EXISTS "Project owner can delete members" ON public.project_members;
CREATE POLICY "Delete project members" ON public.project_members
FOR DELETE USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.created_by = auth.uid())
  OR get_workspace_role(auth.uid()) = 'admin'
);

-- Notifications: workspace members can also insert (for cross-user notifications)
-- (existing policy already allows authenticated INSERT, keeping it)

-- =============================================
-- Auto-register first user as workspace admin
-- =============================================
CREATE OR REPLACE FUNCTION public.auto_register_workspace_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- If no workspace members exist yet, make this user admin
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members LIMIT 1) THEN
    INSERT INTO public.workspace_members (user_id, email, role, status)
    VALUES (NEW.id, NEW.email, 'admin', 'accepted')
    ON CONFLICT (email) DO UPDATE SET user_id = NEW.id, status = 'accepted', role = 'admin';
  ELSE
    -- Check if this user was invited (pending member)
    UPDATE public.workspace_members
    SET user_id = NEW.id, status = 'accepted'
    WHERE email = NEW.email AND status = 'pending' AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Note: This trigger fires on profile creation (ensure_profile is called on login)
-- We need to attach it to a suitable event. Let's use profiles table.
CREATE TRIGGER trg_auto_workspace_on_profile
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.auto_register_workspace_admin();
