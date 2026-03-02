
-- Add locking columns to project_files
ALTER TABLE public.project_files 
ADD COLUMN checking_by uuid REFERENCES auth.users(id) DEFAULT NULL,
ADD COLUMN checking_started_at timestamp with time zone DEFAULT NULL;

-- Create index for quick lock lookups
CREATE INDEX idx_project_files_checking ON public.project_files (checking_by) WHERE checking_by IS NOT NULL;
