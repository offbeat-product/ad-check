
-- Add comparison check tracking fields to check_results
ALTER TABLE public.check_results
  ADD COLUMN IF NOT EXISTS check_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS comparison_round integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parent_check_result_id uuid REFERENCES public.check_results(id) ON DELETE SET NULL;

-- Index for fast lookup of comparison history
CREATE INDEX IF NOT EXISTS idx_check_results_parent ON public.check_results(parent_check_result_id) WHERE parent_check_result_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_check_results_check_type ON public.check_results(check_type) WHERE check_type = 'comparison';
