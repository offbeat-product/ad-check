
-- Trigger function: when a new profile is created (user signs up),
-- link any pending project_members and workspace_members by email
CREATE OR REPLACE FUNCTION public.link_pending_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Link pending project members
  UPDATE public.project_members
  SET user_id = NEW.id
  WHERE email = NEW.email AND user_id IS NULL AND status = 'pending';

  -- Link pending workspace members (already handled by auto_register_workspace_admin but let's ensure)
  UPDATE public.workspace_members
  SET user_id = NEW.id, status = 'accepted'
  WHERE email = NEW.email AND user_id IS NULL AND status = 'pending';

  RETURN NEW;
END;
$$;

-- Create trigger on profiles table
CREATE TRIGGER trg_link_pending_memberships
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.link_pending_memberships();
