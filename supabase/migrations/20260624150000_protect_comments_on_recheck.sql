-- ============================================================================
-- AIチェック再実行・再アップロードでコメントが消える事象を構造的に防ぐ
-- ----------------------------------------------------------------------------
-- ① cascade_delete_check_result:
--    check_result 削除時にコメントを問答無用で消していたのを改め、
--    同一ファイル系統に生き残る別の check_result があればそこへ退避してから削除。
-- ② migrate_comments_on_check_result_relink (新規トリガー):
--    project_files.check_result_id が別の check_result へ張り替わったとき、
--    旧 check_result のコメントを新 check_result へ自動移送する。
--    （旧 check_result が他ファイルからまだ参照されている場合は移送しない）
-- ============================================================================

-- ① コメント保護版の cascade 削除
CREATE OR REPLACE FUNCTION public.cascade_delete_check_result()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_root_id uuid;
  v_survivor_crid uuid;
BEGIN
  DELETE FROM public.check_results WHERE parent_check_result_id = OLD.id;

  SELECT COALESCE(pf.parent_file_id, pf.id) INTO v_root_id
  FROM public.project_files pf
  WHERE pf.check_result_id = OLD.id
  LIMIT 1;

  IF v_root_id IS NOT NULL THEN
    SELECT pf.check_result_id INTO v_survivor_crid
    FROM public.project_files pf
    WHERE (pf.id = v_root_id OR pf.parent_file_id = v_root_id)
      AND pf.check_result_id IS NOT NULL
      AND pf.check_result_id <> OLD.id
    ORDER BY pf.version_number ASC
    LIMIT 1;
  END IF;

  IF v_survivor_crid IS NOT NULL THEN
    UPDATE public.comments SET check_result_id = v_survivor_crid WHERE check_result_id = OLD.id;
  ELSE
    DELETE FROM public.comments WHERE check_result_id = OLD.id;
  END IF;

  DELETE FROM public.share_links WHERE check_result_id = OLD.id;
  DELETE FROM public.correction_logs WHERE check_result_id = OLD.id;

  UPDATE public.project_files SET check_result_id = NULL, status = 'uploaded'
  WHERE check_result_id = OLD.id;

  RETURN OLD;
END;
$function$;

-- ② 紐付け切替時の自動コメント移送トリガー
CREATE OR REPLACE FUNCTION public.migrate_comments_on_check_result_relink()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old uuid := OLD.check_result_id;
  v_new uuid := NEW.check_result_id;
  v_still_referenced int;
BEGIN
  IF v_old IS NULL OR v_new IS NULL OR v_old = v_new THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_still_referenced
  FROM public.project_files
  WHERE check_result_id = v_old AND id <> NEW.id;

  IF v_still_referenced = 0 THEN
    UPDATE public.comments SET check_result_id = v_new WHERE check_result_id = v_old;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_migrate_comments_on_relink ON public.project_files;
CREATE TRIGGER trg_migrate_comments_on_relink
  AFTER UPDATE OF check_result_id ON public.project_files
  FOR EACH ROW
  EXECUTE FUNCTION public.migrate_comments_on_check_result_relink();
