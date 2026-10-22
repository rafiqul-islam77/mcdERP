-- =============================================================================
-- Supabase Seed Data: GMS Needle Management ERP
-- Notes:
--   - Idempotent seed data for system roles and permissions catalog.
--   - Does NOT seed fake real employee passwords or accounts.
--   - Run 'npm run bootstrap-admin' to create the initial Site Admin.
-- =============================================================================

-- Ensure Site Admin role exists
INSERT INTO public.roles (id, name, description, is_system, active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Site Admin', 'Full system access. System-protected role.', true, true)
ON CONFLICT (name) DO UPDATE SET is_system = true, active = true;

-- Sample Operational Roles (customizable by Admin)
INSERT INTO public.roles (name, description, is_system, active)
VALUES
  ('Needle Manager', 'Oversees needle inventory, issues, and daily reports.', false, true),
  ('Floor Operator', 'Performs daily needle entry and basic report generation.', false, true),
  ('Auditor', 'Read-only access to audit trail and operational reports.', false, true)
ON CONFLICT (name) DO NOTHING;

-- Seed Initial Factory Floors (examples)
INSERT INTO public.floors (code, name, description, active, sort_order)
VALUES
  ('FL-A', 'A Floor', 'Sewing & Assembly Floor A', true, 1),
  ('FL-B', 'B Floor', 'Sewing & Assembly Floor B', true, 2),
  ('FL-C', 'C Floor', 'Finishing & Inspection Floor C', true, 3),
  ('FL-D', 'D Floor', 'Sample Section & Technical Floor D', true, 4)
ON CONFLICT (name) DO NOTHING;

-- Seed Initial Designations (examples)
INSERT INTO public.designations (code, name, description, active, sort_order)
VALUES
  ('DES-MGR', 'Manager', 'Departmental Manager', true, 1),
  ('DES-AST', 'Assistant Manager', 'Assistant Department Manager', true, 2),
  ('DES-SR-EX', 'Senior Executive', 'Senior Operations Executive', true, 3),
  ('DES-EX', 'Executive', 'Operations Executive', true, 4),
  ('DES-OFF', 'Officer', 'Field & Record Officer', true, 5),
  ('DES-OPR', 'Operator', 'Machine & Entry Operator', true, 6)
ON CONFLICT (name) DO NOTHING;

-- Ensure all permissions exist and are mapped to Site Admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Site Admin'
ON CONFLICT DO NOTHING;
