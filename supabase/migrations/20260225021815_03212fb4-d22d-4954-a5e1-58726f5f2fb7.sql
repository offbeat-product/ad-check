
-- Clients table
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_clients" ON public.clients FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_clients" ON public.clients FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Products table
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  label text NOT NULL,
  color text,
  rules_desc text,
  meta text,
  sf_enabled boolean DEFAULT false,
  warning text,
  webhook_paths jsonb DEFAULT '{}',
  sample_text text,
  info_lines text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_products" ON public.products FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_products" ON public.products FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Projects table (案件)
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  project_code text,
  description text,
  status text DEFAULT 'active',
  deadline date,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_select_projects" ON public.projects FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_projects" ON public.projects FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_projects" ON public.projects FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_delete_projects" ON public.projects FOR DELETE USING (auth.role() = 'authenticated');

-- Project files table
CREATE TABLE IF NOT EXISTS public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  process_type text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_data text,
  file_size_bytes integer,
  version_number integer DEFAULT 1,
  parent_file_id uuid,
  status text DEFAULT 'uploaded',
  check_result_id uuid,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_project_files" ON public.project_files FOR ALL USING (auth.role() = 'authenticated');
