
-- Create reference_materials table
CREATE TABLE public.reference_materials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope_type text NOT NULL, -- 'product' or 'project'
  scope_id uuid NOT NULL,
  material_type text NOT NULL, -- 'orientation', 'wcheck', 'brand_guideline', 'legal_rule', 'correction_history'
  title text NOT NULL,
  content_text text,
  file_name text,
  file_data text,
  source_url text,
  source_type text NOT NULL DEFAULT 'file_upload', -- 'file_upload', 'text_input', 'url_reference'
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reference_materials ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "auth_select_reference_materials" ON public.reference_materials
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "auth_insert_reference_materials" ON public.reference_materials
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_update_reference_materials" ON public.reference_materials
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "auth_delete_reference_materials" ON public.reference_materials
  FOR DELETE USING (auth.role() = 'authenticated');

-- Index for fast lookups
CREATE INDEX idx_reference_materials_scope ON public.reference_materials (scope_type, scope_id);
CREATE INDEX idx_reference_materials_type ON public.reference_materials (material_type);
