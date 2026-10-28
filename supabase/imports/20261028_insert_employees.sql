-- Employee import: 18 employees from employee_information.md, 2026-10-28.
-- Run this ENTIRE file in Supabase SQL Editor as postgres after project migrations/seed.
-- Uses Needle Man if present, otherwise the existing Floor Operator role (same permissions).
-- Does not rename roles or grant additional permissions.
-- No emails were supplied: reserved placeholders <employee-id>@employees.invalid are used.
-- Employee-ID login/activation is supported; these addresses cannot receive email.
-- Supplied tokens are AES-256-GCM encrypted with this project's local TOKEN_ENCRYPTION_KEY.
-- The running application MUST use that same key. The key is NOT included here.
-- Tokens expire 72 hours after execution, matching the application's activation policy.
-- Existing employee IDs cause the entire import to abort, without resetting accounts/tokens.
-- Four combined floor labels are expanded to multiple assignments; first floor is primary.

BEGIN;
SET LOCAL search_path = pg_catalog, public, extensions;

CREATE TEMP TABLE employee_import_source (
  employee_id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL,
  designation text NOT NULL, floor_codes text[] NOT NULL,
  token_encrypted text NOT NULL, token_fingerprint text NOT NULL
) ON COMMIT DROP;

INSERT INTO employee_import_source VALUES
  ('MCD-2802', 'MD. AL HABIB', 'mcd-2802@employees.invalid', 'ASST.SUPERVISOR', ARRAY['FL-K']::text[], '/8inkmOqfDiDk51H:f4inK3oGQ9yxvY7HcMzgUw==:FYl1s6AawIMw', 'A4X9'),
  ('MCD-1633', 'MD.ANAMUL HAQUE', 'mcd-1633@employees.invalid', 'SUPERVISOR', ARRAY['FL-B']::text[], '5aNWRzbFEgBU22NB:HapI2baJP7C8socU8ozCAA==:3vpkIbe+jNyg', 'T8H5'),
  ('MCD-1094', 'MD. JAHID HASSAN', 'mcd-1094@employees.invalid', 'SR.SUPERVISOR', ARRAY['FL-C']::text[], 'Arjbhp6rl8WmVODn:yuFcWFUujItmdBimMhPc4A==:njvxbvwo5Gzp', 'R2W7'),
  ('MCD-3065', 'MD. ABDUL LOTIF', 'mcd-3065@employees.invalid', 'ASST.SUPERVISOR', ARRAY['FL-D']::text[], 'QszNx52uN0Y6leQT:KwJo/rbt02+4nL3zYfsixQ==:MD4Ue2daZXIm', 'F6Q1'),
  ('MCD-1614', 'MD.ALI MIA', 'mcd-1614@employees.invalid', 'SUPERVISOR', ARRAY['FL-E']::text[], 'kKTamWGJErWN/UzN:1N+nyGnQvBhL0LUJrf9EFA==:qcxEBNBQV+tJ', 'J9D4'),
  ('MCD-2161', 'MD.JAHARUL ISLAM', 'mcd-2161@employees.invalid', 'SUPERVISOR', ARRAY['FL-SMP']::text[], 'A3vG8Ybphjp1+O5A:GxFuw8+gTFK/48sAc5KWKw==:FCjYFnCWuiZ2', 'B3L8'),
  ('MCD-2547', 'MD.MAHABUBAR RAHAMAN', 'mcd-2547@employees.invalid', 'ASST.SUPERVISOR', ARRAY['FL-F']::text[], 'z/B33H5RhCkBqHqY:pqjLlQZJMDbLP9Wf5PGDLg==:vm28pwLkfKKS', 'N7P2'),
  ('MCD-2945', 'MD. JUEL RANA', 'mcd-2945@employees.invalid', 'SUPERVISOR', ARRAY['FL-G']::text[], 'PUhoJbDcMvQQsfwy:oBPlrFiRssN8b7p+UpLZcg==:hhUMlG2dathF', 'C5K1'),
  ('MCD-3231', 'PROSHANTA KUMAR ROY', 'mcd-3231@employees.invalid', 'ASST.SUPERVISOR', ARRAY['FL-F', 'FL-G']::text[], 'HDQFkXyOStlq9NUv:JY5q0lA7GMR2Wjztyjd4Rw==:5FFZMzCqxDsM', 'X4R6'),
  ('MCD-2231', 'MD.MUNSUR ALI', 'mcd-2231@employees.invalid', 'SUPERVISOR', ARRAY['FL-H']::text[], '4Lnzw4PRu4Lhiw8M:0xF/7N+d3ocHyn7c5vmahw==:b1XpM7D94+qH', 'H8N2'),
  ('MCD-2942', 'MD. LITON ISLAM', 'mcd-2942@employees.invalid', 'ASST.SUPERVISOR', ARRAY['FL-I']::text[], '3W4Y6CKd1n04n98y:0pWSoKWYtRRPCRrqcoibJw==:EiZIHkzaFFSK', 'V3J9'),
  ('MCD-3475', 'MD. NAZMUL HAQUE', 'mcd-3475@employees.invalid', 'ASST.SUPERVISOR', ARRAY['FL-A', 'FL-B']::text[], 'dUpFzfl9GxpH986R:e9iC2HLtqo3J/cdo5TpntA==:2EOcsl0b735r', 'M6T1'),
  ('MCD-2311', 'MD.ARIFUL ISLAM', 'mcd-2311@employees.invalid', 'SUPERVISOR', ARRAY['FL-J']::text[], '8Yo6Wy13YP671EmI:ME6V9kbKkmCXwmz1Prx79g==:aYOKfJ1wd5aW', 'P2X7'),
  ('MCD-2496', 'MD.ASADUL ISLAM', 'mcd-2496@employees.invalid', 'SUPERVISOR', ARRAY['FL-A']::text[], 'w89FjmfjQdYYv32u:aEJ9BsrlH/h3uEL9jtnEew==:TxPISrBpzUSP', 'G9W5'),
  ('MCD-2119', 'MD.RAJU AHAMAD', 'mcd-2119@employees.invalid', 'SUPERVISOR', ARRAY['FL-EMB']::text[], 'wpN5TATRNHOBmq95:4z0srOKU+dkBp2vtmyQuIw==:HQSIRG+lBAon', 'Q4C8'),
  ('MCD-3151', 'MD. MAHEDI HASAN', 'mcd-3151@employees.invalid', 'ASST.SUPERVISOR', ARRAY['FL-EMB']::text[], 'TJJuF1BZgwEt8U1M:mpEJbeKjR3eXpfSmvYRvbw==:xff47WzTj0Qs', 'L7F2'),
  ('MCD-3211', 'GM MOHIBULLAH', 'mcd-3211@employees.invalid', 'ASST.SUPERVISOR', ARRAY['FL-G', 'FL-I']::text[], 'ggykobjnqHaYgouE:X3qs3/y0TegsRSohXkezMg==:Qcgt1UjslCCp', 'Z5K3'),
  ('MCD-3599', 'KAMRUZZMAN ISLAM NAZMUL', 'mcd-3599@employees.invalid', 'ASST.SUPERVISOR', ARRAY['FL-C', 'FL-D']::text[], '6LfHpAXZGDVP1u0c:llXzEOhC7hhYJP2mPpFIpg==:hGHUZRekmVD6', 'D8R6');

DO $import$
DECLARE
  r record;
  v_role_id uuid;
  v_user_id uuid;
  v_designation_id uuid;
  v_floor_ids uuid[];
BEGIN
  SELECT id INTO v_role_id FROM public.roles
  WHERE name IN ('Needle Man', 'Floor Operator') AND active = true
  ORDER BY CASE name WHEN 'Needle Man' THEN 0 ELSE 1 END LIMIT 1;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'No active Needle Man or Floor Operator role exists. Apply seed/configure role first.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM employee_import_source s JOIN public.profiles p
      ON upper(p.employee_id) = s.employee_id OR lower(p.email) = s.email
  ) OR EXISTS (
    SELECT 1 FROM employee_import_source s JOIN auth.users u ON lower(u.email) = s.email
  ) THEN
    RAISE EXCEPTION 'An employee ID or email already exists. Import aborted; existing accounts are unchanged.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM employee_import_source s CROSS JOIN unnest(s.floor_codes) AS c(code)
    LEFT JOIN public.floors f ON f.code = c.code AND f.active = true
    WHERE f.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Required active floor code is missing. Apply the floor locations migration first.';
  END IF;

  -- Preserve existing designations; add the three exact source titles if absent.
  INSERT INTO public.designations (name, active)
  SELECT DISTINCT designation, true FROM employee_import_source
  ON CONFLICT (name) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM employee_import_source s JOIN public.designations d ON d.name = s.designation
    WHERE NOT d.active
  ) THEN
    RAISE EXCEPTION 'A required designation is inactive. Import aborted.';
  END IF;

  FOR r IN SELECT * FROM employee_import_source ORDER BY employee_id LOOP
    v_user_id := gen_random_uuid();
    SELECT id INTO STRICT v_designation_id FROM public.designations WHERE name = r.designation;
    SELECT array_agg(f.id ORDER BY c.ordinality) INTO v_floor_ids
    FROM unnest(r.floor_codes) WITH ORDINALITY AS c(code, ordinality)
    JOIN public.floors f ON f.code = c.code;

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new,
      email_change_token_current, email_change, email_change_confirm_status,
      phone_change, phone_change_token, reauthentication_token,
      is_super_admin, is_sso_user, is_anonymous, created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id,
      'authenticated', 'authenticated', r.email,
      crypt(encode(gen_random_bytes(32), 'hex'), gen_salt('bf', 10)), now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object('employee_id', r.employee_id, 'name', r.name),
      '', '', '', '', '', 0, '', '', '', false, false, false, now(), now()
    );

    -- Supabase email/password login also requires the linked email identity.
    -- Do not write generated columns such as identities.email or users.confirmed_at.
    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_user_id::text, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', r.email,
                        'email_verified', true, 'phone_verified', false),
      'email', now(), now()
    );

    INSERT INTO public.profiles (
      id, employee_id, name, email, designation_id, role_id, floor_id, floor_ids,
      account_state, must_set_password
    ) VALUES (
      v_user_id, r.employee_id, r.name, r.email, v_designation_id, v_role_id,
      v_floor_ids[1], v_floor_ids, 'pending_activation', true
    );

    INSERT INTO public.user_access_tokens (
      user_id, token_encrypted, token_fingerprint, purpose, status, expires_at
    ) VALUES (
      v_user_id, r.token_encrypted, r.token_fingerprint, 'activation', 'active', now() + interval '72 hours'
    );

    INSERT INTO public.audit_logs (target_user_id, event_type, entity_type, entity_id, metadata)
    VALUES
      (v_user_id, 'USER_CREATED', 'profile', v_user_id::text,
       jsonb_build_object('source', 'employee_import_20261028', 'employee_id', r.employee_id)),
      (v_user_id, 'ACTIVATION_TOKEN_CREATED', 'profile', v_user_id::text,
       jsonb_build_object('source', 'employee_import_20261028', 'purpose', 'activation'));
  END LOOP;
END;
$import$;

-- Review all 18 imported accounts without revealing tokens.
SELECT p.employee_id, p.name, d.name AS designation, ro.name AS role,
       s.floor_codes, p.account_state, t.expires_at AS activation_expires_at
FROM employee_import_source s
JOIN public.profiles p ON p.employee_id = s.employee_id
JOIN public.designations d ON d.id = p.designation_id
JOIN public.roles ro ON ro.id = p.role_id
JOIN public.user_access_tokens t ON t.user_id = p.id AND t.purpose = 'activation' AND t.status = 'active'
ORDER BY p.employee_id;

COMMIT;
