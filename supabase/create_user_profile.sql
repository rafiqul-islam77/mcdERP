-- Run AFTER combined_migration.sql and seed.sql in Supabase SQL Editor.
-- Creates the Auth user and email identity if missing; no dashboard step needed.
-- This script sets their password to 1234 and creates an active ERP profile.
-- Prepared for Rafiqul Islam (MCD-1255), Site Admin with full access.
-- The password is hashed with bcrypt before storage in Supabase Auth.
-- Role examples: Site Admin (full access), Needle Manager, Floor Operator, Auditor.
-- Non-admin roles need permissions configured under Administration > Roles.
-- This creates a NEW profile; it never overwrites or promotes an existing one.

BEGIN;
SET LOCAL search_path = pg_catalog, public, extensions;

DO $$
DECLARE
  v_email TEXT := lower(trim('jzrafiq@gmail.com'));
  v_employee_id TEXT := upper(trim('MCD-1255'));
  v_name TEXT := trim('Rafiqul Islam');
  v_role_name TEXT := trim('Site Admin');
  v_password TEXT := '1234';
  v_user_id UUID;
  v_auth_email TEXT;
  v_confirmed_at TIMESTAMPTZ;
  v_role_id UUID;
BEGIN
  IF v_email = 'replace_email'
     OR v_employee_id = 'REPLACE_EMPLOYEE_ID'
     OR v_name = 'REPLACE_FULL_NAME'
     OR v_role_name = 'REPLACE_ROLE_NAME'
     OR position('@' IN v_email) < 2
     OR v_employee_id = '' OR length(v_name) < 2 THEN
    RAISE EXCEPTION 'Replace all four values with the new user details before running.';
  END IF;

  SELECT id, email, email_confirmed_at
    INTO v_user_id, v_auth_email, v_confirmed_at
    FROM auth.users
    WHERE lower(email) = v_email;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    v_auth_email := v_email;
    v_confirmed_at := now();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new,
      email_change_token_current, email_change, email_change_confirm_status,
      phone_change, phone_change_token, reauthentication_token,
      is_super_admin, is_sso_user, is_anonymous, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id,
      'authenticated', 'authenticated', v_email,
      crypt(v_password, gen_salt('bf', 10)), v_confirmed_at,
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('employee_id', v_employee_id, 'name', v_name),
      '', '', '', '', '', 0, '', '', '', false, false, false, now(), now()
    );

    -- Supabase email/password login also requires the linked email identity.
    -- Do not write generated columns such as identities.email or users.confirmed_at.
    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id::text, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email,
                        'email_verified', true, 'phone_verified', false),
      'email', now(), now()
    );
  END IF;
  IF v_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Confirm the Auth user email before creating the ERP profile.';
  END IF;

  SELECT id INTO v_role_id FROM public.roles
    WHERE name = v_role_name AND active = true;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Active role not found: %. Run migrations/seed and check the role name.', v_role_name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id OR employee_id = v_employee_id OR lower(email) = v_email
  ) THEN
    RAISE EXCEPTION 'An ERP profile already exists for this Auth user, Employee ID, or email. No changes made.';
  END IF;

  UPDATE auth.users
    SET encrypted_password = crypt(v_password, gen_salt('bf', 10)),
        updated_at = now()
    WHERE id = v_user_id;

  INSERT INTO public.profiles
    (id, employee_id, name, email, role_id, account_state, must_set_password)
  VALUES
    (v_user_id, v_employee_id, v_name, v_auth_email, v_role_id, 'active', false);

  INSERT INTO public.audit_logs
    (target_user_id, event_type, entity_type, entity_id, metadata)
  VALUES
    (v_user_id, 'USER_CREATED', 'profile', v_user_id::text,
     jsonb_build_object('source', 'sql_editor', 'employee_id', v_employee_id, 'role', v_role_name));

  RAISE NOTICE 'ERP profile created. Sign in with Employee ID: % and the password configured in this script.', v_employee_id;
END;
$$;

COMMIT;
