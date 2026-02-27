
-- Add fixed_at and fixed_by columns to project_files
ALTER TABLE public.project_files ADD COLUMN IF NOT EXISTS fixed_at TIMESTAMPTZ;
ALTER TABLE public.project_files ADD COLUMN IF NOT EXISTS fixed_by TEXT;
