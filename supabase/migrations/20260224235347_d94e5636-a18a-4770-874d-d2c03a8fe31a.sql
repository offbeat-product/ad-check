
CREATE TABLE public.check_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_name TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  process_type TEXT NOT NULL,
  input_type TEXT NOT NULL,
  input_text TEXT,
  overall_status TEXT,
  detected_case TEXT,
  ng_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  ok_count INTEGER DEFAULT 0,
  total_checks INTEGER DEFAULT 0,
  check_items JSONB,
  raw_response JSONB
);

ALTER TABLE public.check_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own results" ON public.check_results
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own results" ON public.check_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);
