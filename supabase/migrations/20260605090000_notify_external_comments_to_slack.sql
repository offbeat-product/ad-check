-- Notify Slack when external users (creators / shared-view clients) comment.
-- The existing Slack sender is reused through public.send_slack_notification(message).
-- Notification failures are intentionally non-blocking so comment submission never fails.

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES public.creators(id) ON DELETE SET NULL;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS guest_token text;

CREATE OR REPLACE FUNCTION public.notify_external_comment_to_slack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_label text;
  v_action_label text;
  v_actor_name text;
  v_project_id uuid;
  v_project_name text;
  v_file_id uuid;
  v_file_name text;
  v_product_name text;
  v_client_name text;
  v_message text;
  v_url text;
  v_app_url text := 'https://ad-check-phi.vercel.app';
BEGIN
  -- Internal staff comments already use in-app notifications. Slack is only for external surfaces.
  IF NEW.creator_id IS NOT NULL THEN
    v_source_label := 'クリエイター';
    SELECT COALESCE(c.name, NEW.author_name)
      INTO v_actor_name
      FROM public.creators c
      WHERE c.id = NEW.creator_id;
  ELSIF NEW.guest_token IS NOT NULL OR NEW.author_name LIKE '[共有] %' THEN
    v_source_label := 'クライアント共有ビュー';
    v_actor_name := trim(regexp_replace(NEW.author_name, '^\[共有\]\s*', ''));
  ELSE
    RETURN NEW;
  END IF;

  v_action_label := CASE WHEN NEW.parent_id IS NULL THEN 'コメントしました' ELSE '返信しました' END;

  SELECT
    pf.id,
    pf.file_name,
    p.id,
    p.name,
    pr.name,
    cl.name
  INTO
    v_file_id,
    v_file_name,
    v_project_id,
    v_project_name,
    v_product_name,
    v_client_name
  FROM public.check_results cr
  LEFT JOIN LATERAL (
    SELECT pf_inner.*
    FROM public.project_files pf_inner
    WHERE pf_inner.check_result_id = cr.id
       OR (cr.parent_check_result_id IS NOT NULL AND pf_inner.check_result_id = cr.parent_check_result_id)
    ORDER BY pf_inner.created_at DESC NULLS LAST
    LIMIT 1
  ) pf ON true
  LEFT JOIN public.projects p ON p.id = pf.project_id
  LEFT JOIN public.products pr ON pr.id = p.product_id
  LEFT JOIN public.clients cl ON cl.id = pr.client_id
  WHERE cr.id = NEW.check_result_id;

  IF v_project_id IS NOT NULL AND v_file_id IS NOT NULL THEN
    v_url := format('%s/project/%s/file/%s', v_app_url, v_project_id, v_file_id);
  ELSE
    v_url := v_app_url;
  END IF;

  v_message := concat_ws(
    E'\n',
    format('【Ad Check】%sが%s', v_source_label, v_action_label),
    format('投稿者: %s', COALESCE(NULLIF(v_actor_name, ''), 'ゲスト')),
    format('クライアント: %s', COALESCE(v_client_name, '-')),
    format('商材: %s', COALESCE(v_product_name, '-')),
    format('案件: %s', COALESCE(v_project_name, '-')),
    format('ファイル: %s', COALESCE(v_file_name, '-')),
    format('内容: %s', left(regexp_replace(COALESCE(NEW.content, ''), '\s+', ' ', 'g'), 300)),
    v_url
  );

  BEGIN
    EXECUTE 'select public.send_slack_notification($1)' USING v_message;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Slack notification for external comment failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_external_comment_to_slack ON public.comments;

CREATE TRIGGER trg_notify_external_comment_to_slack
AFTER INSERT ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_external_comment_to_slack();
