
-- Create trigger on auth.users to auto-create profile and link memberships
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_role TEXT;
BEGIN
  -- Check if there's a pending invitation for this email
  SELECT role INTO inv_role FROM public.invitations 
  WHERE email = NEW.email AND status = 'pending' 
  ORDER BY created_at DESC LIMIT 1;
  
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(inv_role, 'viewer')
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    role = COALESCE(inv_role, profiles.role);
  
  RETURN NEW;
END;
$$;

-- Create the trigger on auth.users (drop first if exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create trigger for auto workspace admin registration
CREATE OR REPLACE FUNCTION public.auto_register_workspace_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- If no workspace members exist yet, make this user admin
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members LIMIT 1) THEN
    INSERT INTO public.workspace_members (user_id, email, role, status)
    VALUES (NEW.id, NEW.email, 'admin', 'accepted')
    ON CONFLICT (email) DO UPDATE SET user_id = NEW.id, status = 'accepted', role = 'admin';
  ELSE
    -- Check if this user was invited (pending member)
    UPDATE public.workspace_members
    SET user_id = NEW.id, status = 'accepted'
    WHERE email = NEW.email AND status = 'pending' AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users;
CREATE TRIGGER on_auth_user_created_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_register_workspace_admin();
