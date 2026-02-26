
-- Drop existing RESTRICTIVE policies
DROP POLICY IF EXISTS "auth_select_reference_materials" ON public.reference_materials;
DROP POLICY IF EXISTS "auth_insert_reference_materials" ON public.reference_materials;
DROP POLICY IF EXISTS "auth_update_reference_materials" ON public.reference_materials;
DROP POLICY IF EXISTS "auth_delete_reference_materials" ON public.reference_materials;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "auth_select_reference_materials"
  ON public.reference_materials FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth_insert_reference_materials"
  ON public.reference_materials FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_update_reference_materials"
  ON public.reference_materials FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth_delete_reference_materials"
  ON public.reference_materials FOR DELETE
  USING (auth.role() = 'authenticated');
