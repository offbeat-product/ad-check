
-- ============================================================
-- Fix check_results: make workspace member policies PERMISSIVE
-- ============================================================

-- Drop existing restrictive policies for workspace members
DROP POLICY IF EXISTS "Workspace members can view check_results" ON public.check_results;
DROP POLICY IF EXISTS "Workspace members can insert check_results" ON public.check_results;
DROP POLICY IF EXISTS "Workspace members can update check_results" ON public.check_results;
DROP POLICY IF EXISTS "Workspace members can delete check_results" ON public.check_results;

-- Recreate as PERMISSIVE so workspace members see ALL check_results
CREATE POLICY "Workspace members can view check_results"
  ON public.check_results FOR SELECT
  USING (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can insert check_results"
  ON public.check_results FOR INSERT
  WITH CHECK (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can update check_results"
  ON public.check_results FOR UPDATE
  USING (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can delete check_results"
  ON public.check_results FOR DELETE
  USING (is_workspace_member_accepted(auth.uid()));

-- ============================================================
-- Fix comments: add PERMISSIVE workspace member policies
-- ============================================================

-- Add workspace member policies (currently missing entirely)
CREATE POLICY "Workspace members can view comments"
  ON public.comments FOR SELECT
  USING (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can insert comments"
  ON public.comments FOR INSERT
  WITH CHECK (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can update comments"
  ON public.comments FOR UPDATE
  USING (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can delete comments"
  ON public.comments FOR DELETE
  USING (is_workspace_member_accepted(auth.uid()));

-- ============================================================
-- Fix file_versions: add PERMISSIVE workspace member policies
-- ============================================================

CREATE POLICY "Workspace members can view file_versions"
  ON public.file_versions FOR SELECT
  USING (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can insert file_versions"
  ON public.file_versions FOR INSERT
  WITH CHECK (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can update file_versions"
  ON public.file_versions FOR UPDATE
  USING (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can delete file_versions"
  ON public.file_versions FOR DELETE
  USING (is_workspace_member_accepted(auth.uid()));

-- ============================================================
-- Fix share_links: add PERMISSIVE workspace member policies
-- ============================================================

CREATE POLICY "Workspace members can view share_links"
  ON public.share_links FOR SELECT
  USING (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can manage share_links"
  ON public.share_links FOR ALL
  USING (is_workspace_member_accepted(auth.uid()));

-- ============================================================
-- Fix correction_logs: ensure workspace members have full access
-- ============================================================

CREATE POLICY "Workspace members can delete correction_logs"
  ON public.correction_logs FOR DELETE
  USING (is_workspace_member_accepted(auth.uid()));
