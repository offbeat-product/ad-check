-- 履歴対称化: 本番 DB へ 2026-05-19 に直接適用済み。
-- ローカルは supabase db reset 等で適用される。本番再実行時は CREATE OR REPLACE のみ（冪等）。

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
  v_user_email text;
BEGIN
  SELECT * INTO inv FROM public.invitations
  WHERE token = p_token AND status = 'pending' AND expires_at > now();
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- p_user_id のメールが招待のメールと一致することを確認
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  IF v_user_email IS NULL OR lower(v_user_email) <> lower(inv.email) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = inv.id;

  UPDATE public.profiles
    SET role = inv.role, invited_by = inv.invited_by, invited_at = now()
    WHERE id = p_user_id;

  UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = p_user_id;

  RETURN TRUE;
END;
$function$;
