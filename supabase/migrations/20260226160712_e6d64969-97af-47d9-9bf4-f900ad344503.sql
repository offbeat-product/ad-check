
-- Fix overly permissive anon policies on invitations
-- Replace broad anon SELECT with token-scoped access only
DROP POLICY IF EXISTS "Anyone can read invitation by token" ON public.invitations;
DROP POLICY IF EXISTS "Anon can accept invitation" ON public.invitations;

-- Anon can only read by matching token (enforced via RPC get_invitation_by_token instead)
-- No direct table access for anon needed since we use security definer functions
