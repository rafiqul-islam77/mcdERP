-- Change the pictured Site Admin account from MCD-1255 to ADMIN-001.
-- Run the entire file in Supabase SQL Editor as postgres.
-- Afterwards, sign in using ADMIN-001 and the existing password.
-- Preserves the account UUID, password, email, role, floors and token records.

BEGIN;
LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE
  v_user_id uuid;
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.profiles
  WHERE upper(employee_id) = 'MCD-1255';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one MCD-1255 account; found %. No changes made. If already migrated, use ADMIN-001.', v_count;
  END IF;

  SELECT p.id INTO v_user_id
  FROM public.profiles p JOIN public.roles r ON r.id = p.role_id
  WHERE upper(p.employee_id) = 'MCD-1255' AND r.name = 'Site Admin';
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'MCD-1255 is not a Site Admin. No changes made.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE upper(employee_id) = 'ADMIN-001') THEN
    RAISE EXCEPTION 'ADMIN-001 is already assigned. No changes made.';
  END IF;

  UPDATE public.profiles
  SET employee_id = 'ADMIN-001', updated_at = now()
  WHERE id = v_user_id;

  UPDATE auth.users
  SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                           || jsonb_build_object('employee_id', 'ADMIN-001'),
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.audit_logs
    (target_user_id, event_type, entity_type, entity_id, old_data, new_data, metadata)
  VALUES
    (v_user_id, 'EMPLOYEE_ID_CHANGED', 'profile', v_user_id::text,
     jsonb_build_object('employee_id', 'MCD-1255'),
     jsonb_build_object('employee_id', 'ADMIN-001'),
     jsonb_build_object('source', '20261125000000_change_admin_employee_id'));
END;
$migration$;

SELECT id, employee_id, name, account_state
FROM public.profiles WHERE employee_id = 'ADMIN-001';

COMMIT;
