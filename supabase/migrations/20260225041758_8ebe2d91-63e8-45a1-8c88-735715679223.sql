
-- Add new columns to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS overall_deadline date DEFAULT NULL;

-- Create project_processes table
CREATE TABLE public.project_processes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  process_key text NOT NULL,
  process_label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  deadline date DEFAULT NULL,
  status text NOT NULL DEFAULT 'not_started',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_processes ENABLE ROW LEVEL SECURITY;

-- RLS policies scoped to project owner
CREATE POLICY "Users view own project_processes"
ON public.project_processes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_processes.project_id
      AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users insert own project_processes"
ON public.project_processes FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_processes.project_id
      AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users update own project_processes"
ON public.project_processes FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_processes.project_id
      AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users delete own project_processes"
ON public.project_processes FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_processes.project_id
      AND projects.created_by = auth.uid()
  )
);

-- Index for fast lookup
CREATE INDEX idx_project_processes_project_id ON public.project_processes(project_id);
