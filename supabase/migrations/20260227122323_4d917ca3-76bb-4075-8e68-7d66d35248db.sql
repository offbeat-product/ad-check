ALTER TABLE public.project_processes ADD COLUMN IF NOT EXISTS is_common BOOLEAN NOT NULL DEFAULT false;

-- Set defaults for existing common processes
UPDATE public.project_processes SET is_common = true WHERE process_key IN ('na_script', 'bgm', 'narration');