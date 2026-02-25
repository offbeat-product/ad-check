
-- Fix check_rules SELECT policy to allow all authenticated users
DROP POLICY IF EXISTS "check_rules_select" ON public.check_rules;
DROP POLICY IF EXISTS "check_rules_select_all" ON public.check_rules;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.check_rules;
DROP POLICY IF EXISTS "Authenticated users can view check_rules" ON public.check_rules;

CREATE POLICY "check_rules_select_all" ON public.check_rules FOR SELECT USING (true);
