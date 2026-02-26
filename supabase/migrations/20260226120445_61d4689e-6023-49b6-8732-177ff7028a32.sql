
-- Fix: Drop all RESTRICTIVE policies and recreate as PERMISSIVE
DROP POLICY IF EXISTS "auth_select_reference_materials" ON public.reference_materials;
DROP POLICY IF EXISTS "auth_insert_reference_materials" ON public.reference_materials;
DROP POLICY IF EXISTS "auth_update_reference_materials" ON public.reference_materials;
DROP POLICY IF EXISTS "auth_delete_reference_materials" ON public.reference_materials;

-- Recreate as PERMISSIVE (explicitly)
CREATE POLICY "permissive_select_reference_materials"
  ON public.reference_materials FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "permissive_insert_reference_materials"
  ON public.reference_materials FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "permissive_update_reference_materials"
  ON public.reference_materials FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "permissive_delete_reference_materials"
  ON public.reference_materials FOR DELETE TO authenticated
  USING (true);
