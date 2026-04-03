-- banner_draft was missing from initial seed; mixed / banner pipelines need it for 静止画バナー tab
INSERT INTO public.process_types (code, name, creative_type, sort_order, used_by_check, is_active) VALUES
  ('banner_draft', 'バナー構成案', 'banner', 9, true, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  creative_type = EXCLUDED.creative_type,
  sort_order = EXCLUDED.sort_order,
  used_by_check = EXCLUDED.used_by_check,
  is_active = EXCLUDED.is_active;

-- Mixed 案件にバナー工程が無い既存データへ補完（マイグレーション適用後にそのままタブに表示される）
INSERT INTO public.project_processes (project_id, process_key, process_label, sort_order, is_active, is_common, status)
SELECT
  p.id,
  'banner_draft',
  'バナー構成案',
  (SELECT COALESCE(MAX(pp.sort_order), 0) + 1 FROM public.project_processes pp WHERE pp.project_id = p.id),
  true,
  false,
  'preparing'
FROM public.projects p
WHERE p.creative_type = 'mixed'
  AND NOT EXISTS (
    SELECT 1 FROM public.project_processes x
    WHERE x.project_id = p.id AND x.process_key = 'banner_draft'
  );

INSERT INTO public.project_processes (project_id, process_key, process_label, sort_order, is_active, is_common, status)
SELECT
  p.id,
  'banner_design',
  'バナーデザイン',
  (SELECT COALESCE(MAX(pp.sort_order), 0) + 1 FROM public.project_processes pp WHERE pp.project_id = p.id),
  true,
  false,
  'preparing'
FROM public.projects p
WHERE p.creative_type = 'mixed'
  AND NOT EXISTS (
    SELECT 1 FROM public.project_processes x
    WHERE x.project_id = p.id AND x.process_key = 'banner_design'
  );
