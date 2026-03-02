
-- Add updated_at column to check_results for detecting n8n UPDATEs
ALTER TABLE public.check_results
ADD COLUMN updated_at timestamp with time zone DEFAULT now();

-- Backfill existing rows
UPDATE public.check_results SET updated_at = created_at WHERE updated_at IS NULL;

-- Auto-update on modification
CREATE OR REPLACE FUNCTION public.update_check_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_check_results_updated_at
BEFORE UPDATE ON public.check_results
FOR EACH ROW
EXECUTE FUNCTION public.update_check_results_updated_at();
