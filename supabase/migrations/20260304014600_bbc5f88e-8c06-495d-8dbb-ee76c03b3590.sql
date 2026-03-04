-- Remove internal_deadline column from project_processes
ALTER TABLE public.project_processes DROP COLUMN IF EXISTS internal_deadline;

-- Delete internal KPI targets
DELETE FROM public.kpi_targets WHERE key IN ('internal_deadline_compliance', 'internal_first_draft_pass');

-- Also delete generic (non-prefixed) targets since we only keep client ones
DELETE FROM public.kpi_targets WHERE key IN ('deadline_compliance', 'first_draft_pass');
