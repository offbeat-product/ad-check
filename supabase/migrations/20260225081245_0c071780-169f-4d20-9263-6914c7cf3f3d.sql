
-- ===========================================
-- 1. Profiles テーブル（ユーザープロフィール）
-- ===========================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  notify_check_complete boolean NOT NULL DEFAULT true,
  notify_comment boolean NOT NULL DEFAULT true,
  notify_invitation boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- プロフィール存在保証関数（フロントエンドから呼び出し）
CREATE OR REPLACE FUNCTION public.ensure_profile(p_user_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (p_user_id, p_email, split_part(p_email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ===========================================
-- 2. Notifications テーブル（通知）
-- ===========================================
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text,
  data jsonb DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users delete own notifications"
ON public.notifications FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- リアルタイム有効化
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ===========================================
-- 3. Project Members テーブル（メンバー管理）
-- ===========================================
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer',
  invited_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, email)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- プロジェクトオーナーは全操作可能
CREATE POLICY "Project owner can select members"
ON public.project_members FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.created_by = auth.uid()
));

CREATE POLICY "Project owner can insert members"
ON public.project_members FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.created_by = auth.uid()
));

CREATE POLICY "Project owner can update members"
ON public.project_members FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.created_by = auth.uid()
));

CREATE POLICY "Project owner can delete members"
ON public.project_members FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM projects WHERE projects.id = project_members.project_id AND projects.created_by = auth.uid()
));

-- メンバー自身も自分のレコードを閲覧・更新可能（承認/辞退）
CREATE POLICY "Members can view own membership"
ON public.project_members FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Members can update own membership"
ON public.project_members FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- ===========================================
-- 4. Projects テーブルのRLS拡張（メンバーも閲覧可能に）
-- ===========================================

-- 既存ポリシーを削除して再作成（メンバーも閲覧可能に）
DROP POLICY IF EXISTS "Users view own projects" ON public.projects;
CREATE POLICY "Users view own or member projects"
ON public.projects FOR SELECT
TO authenticated
USING (
  auth.uid() = created_by
  OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = projects.id
    AND pm.user_id = auth.uid()
    AND pm.status = 'accepted'
  )
);

-- project_files も同様にメンバーが閲覧可能に
DROP POLICY IF EXISTS "Users view own project_files" ON public.project_files;
CREATE POLICY "Users view own or member project_files"
ON public.project_files FOR SELECT
TO authenticated
USING (
  (EXISTS (SELECT 1 FROM projects WHERE projects.id = project_files.project_id AND projects.created_by = auth.uid()))
  OR (EXISTS (SELECT 1 FROM check_results WHERE check_results.id = project_files.check_result_id AND check_results.user_id = auth.uid()))
  OR (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project_files.project_id AND pm.user_id = auth.uid() AND pm.status = 'accepted'))
);

-- project_processes もメンバーが閲覧可能に
DROP POLICY IF EXISTS "Users view own project_processes" ON public.project_processes;
CREATE POLICY "Users view own or member project_processes"
ON public.project_processes FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM projects WHERE projects.id = project_processes.project_id AND projects.created_by = auth.uid())
  OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project_processes.project_id AND pm.user_id = auth.uid() AND pm.status = 'accepted')
);
