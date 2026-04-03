-- Master process definitions for Ad Check (video / banner pipelines)
CREATE TABLE IF NOT EXISTS public.process_types (
  code text PRIMARY KEY,
  name text NOT NULL,
  creative_type text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  used_by_check boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.process_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "process_types_select_authenticated" ON public.process_types;
CREATE POLICY "process_types_select_authenticated"
  ON public.process_types FOR SELECT TO authenticated USING (true);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS creative_type text NOT NULL DEFAULT 'video';

COMMENT ON COLUMN public.projects.creative_type IS 'video | banner — drives which process_types apply';

-- Seed defaults (ON CONFLICT: keep existing rows from remote)
INSERT INTO public.process_types (code, name, creative_type, sort_order, used_by_check, is_active) VALUES
  ('script', '構成/字コンテ', 'common', 1, true, true),
  ('na_script', 'NA原稿', 'video', 2, true, true),
  ('narration', 'ナレーション', 'video', 3, true, true),
  ('bgm', 'BGM', 'video', 4, true, true),
  ('vcon', 'Vコン', 'video', 5, true, true),
  ('styleframe', 'スタイルフレーム', 'video', 6, true, true),
  ('storyboard', '絵コンテ', 'video', 7, true, true),
  ('video_horizontal', '横動画', 'video', 8, true, true),
  ('video_vertical', '縦動画', 'video', 9, true, true),
  ('banner_design', 'バナーデザイン', 'banner', 10, true, true)
ON CONFLICT (code) DO NOTHING;
