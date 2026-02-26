
-- Create trigger for auto-registering workspace admin on profile creation
CREATE OR REPLACE TRIGGER trg_auto_workspace_on_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_register_workspace_admin();

-- Seed current user as workspace admin (first user)
INSERT INTO public.workspace_members (user_id, email, role, status)
VALUES ('32158775-fcf3-4f75-81b6-716fac45fa0b', 'daiki.ide@offbeat-inc.co.jp', 'admin', 'accepted')
ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id, status = 'accepted', role = 'admin';
