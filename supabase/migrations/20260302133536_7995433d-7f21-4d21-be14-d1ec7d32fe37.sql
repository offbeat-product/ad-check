
-- KPI target values (admin-editable)
CREATE TABLE public.kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  target_value integer NOT NULL DEFAULT 100,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;

-- Everyone can read targets
CREATE POLICY "Authenticated users can view kpi_targets"
  ON public.kpi_targets FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only workspace admins can update
CREATE POLICY "Workspace admins can update kpi_targets"
  ON public.kpi_targets FOR UPDATE
  USING (get_workspace_role(auth.uid()) = 'admin');

CREATE POLICY "Workspace admins can insert kpi_targets"
  ON public.kpi_targets FOR INSERT
  WITH CHECK (get_workspace_role(auth.uid()) = 'admin');

-- Seed default targets
INSERT INTO public.kpi_targets (key, label, target_value) VALUES
  ('deadline_compliance', '納期遵守率', 100),
  ('first_draft_pass', '初稿合格率', 80),
  ('second_draft_pass', '第2稿合格率', 90),
  ('third_draft_pass', '第3稿合格率', 95);
