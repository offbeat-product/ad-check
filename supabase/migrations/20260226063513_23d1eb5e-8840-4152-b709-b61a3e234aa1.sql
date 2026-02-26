
-- Fix search_path on validate_workspace_member
CREATE OR REPLACE FUNCTION public.validate_workspace_member()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.role NOT IN ('admin', 'member', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role: %', NEW.role;
  END IF;
  IF NEW.status NOT IN ('pending', 'accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
