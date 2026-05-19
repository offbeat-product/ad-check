-- 履歴対称化: 本番 DB へ 2026-05-19 に直接適用済み。
-- ローカルは supabase db reset 等で適用される。本番再実行時は UPDATE 0 件・制約の DROP/ADD のみ（冪等）。

-- 旧 'member' 行（全て cancelled の legacy）を新スキーマに合わせて正規化
UPDATE public.invitations
SET role = 'admin'
WHERE role = 'member';

-- 旧 CHECK 制約を profiles.role と同じ ('admin','director') に揃える
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('admin', 'director'));
