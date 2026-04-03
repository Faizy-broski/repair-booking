-- Add email to profiles for tenant-lookup without requiring auth.users access
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Backfill from auth.users for existing profiles
UPDATE profiles p
   SET email = u.email
  FROM auth.users u
 WHERE u.id = p.id
   AND p.email IS NULL;

-- Index for fast tenant lookup by email
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
