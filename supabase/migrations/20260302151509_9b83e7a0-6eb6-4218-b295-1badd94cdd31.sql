
-- Add submission_type column to project_files
-- 'internal' = 社内提出, 'client' = クライアント提出
ALTER TABLE public.project_files
ADD COLUMN submission_type text NOT NULL DEFAULT 'internal';

-- Add index for reporting queries
CREATE INDEX idx_project_files_submission_type ON public.project_files (submission_type);
