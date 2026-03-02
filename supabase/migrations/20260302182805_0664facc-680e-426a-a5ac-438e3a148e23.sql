
-- Track each "クライアント提出" / "社内修正する" button click
CREATE TABLE public.submission_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL,
  project_id uuid,
  product_id uuid,
  process_type text NOT NULL,
  action_type text NOT NULL, -- 'client_submit' or 'internal_revision'
  version_number integer NOT NULL DEFAULT 1,
  pattern_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.submission_logs ENABLE ROW LEVEL SECURITY;

-- Workspace members can manage
CREATE POLICY "Workspace members can view submission_logs"
  ON public.submission_logs FOR SELECT
  USING (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can insert submission_logs"
  ON public.submission_logs FOR INSERT
  WITH CHECK (is_workspace_member_accepted(auth.uid()));

CREATE POLICY "Workspace members can delete submission_logs"
  ON public.submission_logs FOR DELETE
  USING (is_workspace_member_accepted(auth.uid()));

-- Index for report queries
CREATE INDEX idx_submission_logs_project ON public.submission_logs(project_id, action_type);
CREATE INDEX idx_submission_logs_product ON public.submission_logs(product_id, action_type);
CREATE INDEX idx_submission_logs_created ON public.submission_logs(created_at);
