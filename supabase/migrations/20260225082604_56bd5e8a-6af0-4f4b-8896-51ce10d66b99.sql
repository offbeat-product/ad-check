
-- Fix: restrict profiles SELECT to own profile only
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Create a SECURITY DEFINER function for looking up profiles by email (used in member invitation)
CREATE OR REPLACE FUNCTION public.lookup_profile_by_email(p_email text)
RETURNS TABLE(id uuid, display_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name
  FROM public.profiles p
  WHERE p.email = p_email
  LIMIT 1;
$$;

-- Create a SECURITY DEFINER function for looking up display names by user IDs (used in member list)
CREATE OR REPLACE FUNCTION public.get_profiles_by_ids(p_ids uuid[])
RETURNS TABLE(id uuid, display_name text, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.display_name, p.email
  FROM public.profiles p
  WHERE p.id = ANY(p_ids);
$$;
