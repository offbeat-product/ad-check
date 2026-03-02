
-- Add internal_deadline and client_deadline to project_processes
ALTER TABLE public.project_processes 
ADD COLUMN internal_deadline date,
ADD COLUMN client_deadline date;

-- Migrate existing deadline data to internal_deadline (default assumption)
UPDATE public.project_processes 
SET internal_deadline = deadline 
WHERE deadline IS NOT NULL;
