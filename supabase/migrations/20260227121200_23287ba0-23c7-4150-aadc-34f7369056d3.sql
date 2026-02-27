
-- Create patterns table
CREATE TABLE public.patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add pattern_id to project_files
ALTER TABLE public.project_files ADD COLUMN IF NOT EXISTS pattern_id UUID REFERENCES public.patterns(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;

-- RLS policies for patterns (same access as projects)
CREATE POLICY "Users view patterns" ON public.patterns FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = patterns.project_id AND projects.created_by = auth.uid())
    OR is_project_member(project_id, auth.uid())
    OR is_workspace_member_accepted(auth.uid())
  );

CREATE POLICY "Users insert patterns" ON public.patterns FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = patterns.project_id AND projects.created_by = auth.uid())
    OR get_workspace_role(auth.uid()) = ANY (ARRAY['admin', 'member'])
  );

CREATE POLICY "Users update patterns" ON public.patterns FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = patterns.project_id AND projects.created_by = auth.uid())
    OR get_workspace_role(auth.uid()) = ANY (ARRAY['admin', 'member'])
  );

CREATE POLICY "Users delete patterns" ON public.patterns FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM projects WHERE projects.id = patterns.project_id AND projects.created_by = auth.uid())
    OR get_workspace_role(auth.uid()) = 'admin'
  );
