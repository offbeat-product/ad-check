
-- Add status column to check_results
ALTER TABLE public.check_results ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

-- Create comments table
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_result_id uuid NOT NULL REFERENCES public.check_results(id) ON DELETE CASCADE,
  check_item_id text,
  author_name text NOT NULL,
  author_email text NOT NULL,
  content text NOT NULL,
  annotation_data jsonb,
  status text NOT NULL DEFAULT 'open',
  parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view comments"
  ON public.comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert comments"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update comments"
  ON public.comments FOR UPDATE
  TO authenticated
  USING (true);

-- Create file_versions table
CREATE TABLE public.file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_result_id uuid NOT NULL REFERENCES public.check_results(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  file_type text NOT NULL,
  content_text text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view file_versions"
  ON public.file_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert file_versions"
  ON public.file_versions FOR INSERT
  TO authenticated
  WITH CHECK (true);
