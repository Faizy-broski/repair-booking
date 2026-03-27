-- ============================================================
-- 005_superadmin.sql
-- Seed the default Super Admin user
-- Credentials:
--   Email    : admin@repairbooking.co.uk
--   Password : SuperAdmin@2026!
-- Change the password immediately after first login.
-- ============================================================

DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Look up existing user (idempotent)
  SELECT id INTO v_admin_id
  FROM auth.users
  WHERE email = 'admin@repairbooking.co.uk';

  -- Only create if not already present
  IF v_admin_id IS NULL THEN
    v_admin_id := gen_random_uuid();

    -- 1. Create the auth user
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at,
      confirmation_token,
      email_change_token_new,
      email_change,
      recovery_token
    ) VALUES (
      v_admin_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@repairbooking.co.uk',
      extensions.crypt('SuperAdmin@2026!', extensions.gen_salt('bf')),
      NOW(),                                        -- email pre-confirmed
      '{"provider":"email","providers":["email"]}',
      '{"full_name":"Super Admin"}',
      'authenticated',
      'authenticated',
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    );

    -- 2. Create the auth identity (required for email/password login)
    INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_admin_id,
      v_admin_id::TEXT,
      json_build_object(
        'sub',   v_admin_id::TEXT,
        'email', 'admin@repairbooking.co.uk'
      ),
      'email',
      NOW(),
      NOW(),
      NOW()
    );
  END IF;

  -- 3. Upsert the profile (super_admin has no business or branch)
  INSERT INTO profiles (id, business_id, branch_id, role, full_name, is_active)
  VALUES (v_admin_id, NULL, NULL, 'super_admin', 'Super Admin', TRUE)
  ON CONFLICT (id) DO UPDATE
    SET role      = 'super_admin',
        full_name = 'Super Admin',
        is_active = TRUE;

END $$;
