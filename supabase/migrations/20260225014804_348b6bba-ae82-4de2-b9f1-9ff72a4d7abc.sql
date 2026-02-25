
ALTER TABLE public.check_results ADD COLUMN IF NOT EXISTS input_data jsonb;

-- Allow authenticated users to update check_results (needed for status changes)
CREATE POLICY "Users can update own results"
ON public.check_results
FOR UPDATE
USING (auth.uid() = user_id);
