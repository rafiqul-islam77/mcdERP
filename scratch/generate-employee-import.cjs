const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());
const rawKey = process.env.TOKEN_ENCRYPTION_KEY;
assert.match(rawKey || '', /^[a-f\d]{64}$/i, 'Valid local token encryption key required');
const key = Buffer.from(rawKey, 'hex');
const source = fs.readFileSync('C:/Users/tazzi/Downloads/employee_information.md', 'utf8');
const rows = source.split(/\r?\n/).filter(l => /^\|.*MCD-\d+/.test(l)).map(l => l.split('|').slice(1,-1).map(s => s.trim()));
assert.equal(rows.length, 18);
assert.equal(new Set(rows.map(r => r[1])).size, 18);
assert.equal(new Set(rows.map(r => r[5])).size, 18);
const quote = s => "'" + s.replaceAll("'", "''") + "'";
const values = rows.map(([name, id, designation, floor, role, token]) => {
  assert.equal(role, 'Needle Man');
  assert.match(token, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const floors = floor.replace(/-FLOOR$/, '').split('+').map(f => 'FL-' + (f === 'SAMPLE' ? 'SMP' : f));
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = [iv, tag, encrypted].map(b => b.toString('base64')).join(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  assert.equal(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(), token);
  return `  (${[id, name, id.toLowerCase() + '@employees.invalid', designation].map(quote).join(', ')}, ARRAY[${floors.map(quote).join(', ')}]::text[], ${quote(payload)}, ${quote(token.slice(0,4))})`;
});
const authTemplate = fs.readFileSync('supabase/create_user_profile.sql', 'utf8');
const authStart = authTemplate.indexOf('    INSERT INTO auth.users (');
const authInsert = authTemplate.slice(authStart, authTemplate.indexOf('\n  END IF;', authStart))
  .replaceAll('v_employee_id', 'r.employee_id').replaceAll('v_name', 'r.name')
  .replaceAll('v_email', 'r.email').replaceAll('v_confirmed_at', 'now()')
  .replaceAll('v_password', "encode(gen_random_bytes(32), 'hex')");
assert.ok(authInsert.includes('INSERT INTO auth.users'));
assert.ok(authInsert.includes('INSERT INTO auth.identities'));
const sql = `-- Employee import: 18 employees from employee_information.md, 2026-10-28.
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
${values.join(',\n')};

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

${authInsert}

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
`;
for (const r of rows) assert.ok(!sql.includes(r[5]), 'Plaintext token must not appear');
assert.ok(!sql.includes(rawKey), 'Encryption key must not appear');
fs.mkdirSync('supabase/imports', { recursive: true });
fs.writeFileSync('supabase/imports/20261028_insert_employees.sql', sql);
console.log('Generated SQL for 18 unique employees; all 18 encrypted tokens round-trip successfully; no plaintext tokens or encryption key included.');
