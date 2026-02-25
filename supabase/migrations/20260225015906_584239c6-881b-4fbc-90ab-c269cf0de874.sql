
-- Correction patterns learning table
CREATE TABLE IF NOT EXISTS public.correction_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_code text NOT NULL,
  rule_id text NOT NULL,
  rule_title text,
  original_content text NOT NULL,
  corrected_content text NOT NULL,
  category text,
  frequency integer DEFAULT 1,
  auto_apply boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Share links table
CREATE TABLE IF NOT EXISTS public.share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_result_id uuid REFERENCES public.check_results(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  password_hash text,
  expires_at timestamptz,
  allow_download boolean DEFAULT true,
  allow_comment_read boolean DEFAULT true,
  allow_comment_write boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Comment file attachments
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS attachment_type text;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS attachment_name text;

-- Enable RLS
ALTER TABLE public.correction_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

-- RLS policies for correction_patterns
CREATE POLICY "Users can view correction patterns" ON public.correction_patterns
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert correction patterns" ON public.correction_patterns
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own correction patterns" ON public.correction_patterns
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- RLS policies for share_links
CREATE POLICY "Users can view share links" ON public.share_links
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert share links" ON public.share_links
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can delete own share links" ON public.share_links
  FOR DELETE TO authenticated USING (true);

-- Storage bucket for comment attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('comment-attachments', 'comment-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view comment attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'comment-attachments');

CREATE POLICY "Authenticated users can upload comment attachments" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'comment-attachments');
