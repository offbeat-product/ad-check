
-- Allow all authenticated users to view all profiles (needed for member lists)
DROP POLICY IF EXISTS "Users view own profile" ON profiles;
CREATE POLICY "Authenticated users can view all profiles" ON profiles
  FOR SELECT TO authenticated USING (true);

-- Set initial admin
UPDATE profiles SET role = 'admin' WHERE email = 'daiki.ide@offbeat-inc.co.jp';
