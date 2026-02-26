
-- 1. Add role and invitation-related columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer',
  ADD COLUMN IF NOT EXISTS invited_by UUID,
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add constraint for role values
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'member', 'viewer'));

-- Set first user (daiki.ide) as admin
UPDATE public.profiles SET role = 'admin' WHERE id = '32158775-fcf3-4f75-81b6-716fac45fa0b';

-- 2. Create invitations table
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  display_name TEXT,
  invited_by UUID NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT invitations_role_check CHECK (role IN ('admin', 'member', 'viewer')),
  CONSTRAINT invitations_status_check CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- 3. Create security definer function to check admin role (avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'admin'
  );
$$;

-- 4. Create security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _user_id;
$$;

-- 5. RLS policies for invitations
CREATE POLICY "Admins can manage invitations" ON public.invitations
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

-- 6. Public read access to invitations by token (for accept-invite page, unauthenticated)
CREATE POLICY "Anyone can read invitation by token" ON public.invitations
  FOR SELECT TO anon
  USING (true);

-- 7. Anon can update invitation status (for accepting)
CREATE POLICY "Anon can accept invitation" ON public.invitations
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- 8. Update handle_new_user to include role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 9. Update ensure_profile to preserve role
CREATE OR REPLACE FUNCTION public.ensure_profile(p_email TEXT, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (p_user_id, p_email, split_part(p_email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. Function to get invitation by token (public access)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token TEXT)
RETURNS TABLE(
  id UUID, email TEXT, role TEXT, display_name TEXT, 
  invited_by UUID, status TEXT, expires_at TIMESTAMPTZ,
  inviter_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    i.id, i.email, i.role, i.display_name,
    i.invited_by, i.status, i.expires_at,
    COALESCE(p.display_name, p.email) as inviter_name
  FROM public.invitations i
  LEFT JOIN public.profiles p ON p.id = i.invited_by
  WHERE i.token = p_token;
$$;

-- 11. Function to accept invitation
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token TEXT, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
BEGIN
  SELECT * INTO inv FROM public.invitations 
  WHERE token = p_token AND status = 'pending' AND expires_at > now();
  
  IF NOT FOUND THEN RETURN FALSE; END IF;
  
  -- Update invitation status
  UPDATE public.invitations SET status = 'accepted', accepted_at = now() WHERE id = inv.id;
  
  -- Update profile role
  UPDATE public.profiles SET role = inv.role, invited_by = inv.invited_by, invited_at = now()
  WHERE id = p_user_id;
  
  RETURN TRUE;
END;
$$;
