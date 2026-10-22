-- =============================================================================
-- Migration: 20241001000003_roles_permissions.sql
-- Description: Roles, Permissions, and Role Permissions mapping.
--              Includes Site Admin system role and comprehensive permission catalog.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table: roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT        NULL,
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_roles_name UNIQUE (name)
);

COMMENT ON TABLE  public.roles IS 'Application roles, e.g. Site Admin, Needle Manager, Operator.';
COMMENT ON COLUMN public.roles.is_system IS 'True for protected system roles (Site Admin) which cannot be deleted or disabled.';

CREATE INDEX IF NOT EXISTS idx_roles_name   ON public.roles (name);
CREATE INDEX IF NOT EXISTS idx_roles_active ON public.roles (active);

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  module      TEXT NULL,
  page        TEXT NULL,
  action      TEXT NULL,
  label       TEXT NULL,
  description TEXT NULL
);

COMMENT ON TABLE public.permissions IS 'Catalog of all granular permissions in the ERP system.';
CREATE INDEX IF NOT EXISTS idx_permissions_key ON public.permissions (key);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON public.permissions (module);

-- ---------------------------------------------------------------------------
-- Table: role_permissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id       UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON public.role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_perm_id ON public.role_permissions (permission_id);

-- ---------------------------------------------------------------------------
-- Back-fill FK on profiles for role_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_role_id
  FOREIGN KEY (role_id) REFERENCES public.roles(id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_all_roles"
  ON public.roles AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_permissions"
  ON public.permissions AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_role_permissions"
  ON public.role_permissions AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Authenticated users read access
CREATE POLICY "authenticated_select_active_roles"
  ON public.roles AS PERMISSIVE FOR SELECT
  TO authenticated USING (active = true);

CREATE POLICY "authenticated_select_permissions"
  ON public.permissions AS PERMISSIVE FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated_select_role_permissions"
  ON public.role_permissions AS PERMISSIVE FOR SELECT
  TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Seed Site Admin role
-- ---------------------------------------------------------------------------
INSERT INTO public.roles (id, name, description, is_system, active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Site Admin', 'Full system access. System protected role.', true, true)
ON CONFLICT (name) DO UPDATE SET is_system = true, active = true;

-- ---------------------------------------------------------------------------
-- Seed Permission Catalog
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (key, module, page, action, label, description)
VALUES
  -- Dashboard
  ('dashboard.view', 'dashboard', 'dashboard', 'view', 'Dashboard - View', 'Access main ERP dashboard overview'),

  -- Needle: Daily Entry
  ('needle.daily_entry.view', 'needle', 'daily_entry', 'view', 'Needle Daily Entry - View', 'View needle daily entry page'),
  ('needle.daily_entry.create', 'needle', 'daily_entry', 'create', 'Needle Daily Entry - Create', 'Record new needle daily entry'),
  ('needle.daily_entry.edit', 'needle', 'daily_entry', 'edit', 'Needle Daily Entry - Edit', 'Modify needle daily entry records'),
  ('needle.daily_entry.delete', 'needle', 'daily_entry', 'delete', 'Needle Daily Entry - Delete', 'Remove needle daily entry records'),
  ('needle.daily_entry.export', 'needle', 'daily_entry', 'export', 'Needle Daily Entry - Export', 'Export needle daily entry data to Excel/CSV'),
  ('needle.daily_entry.print', 'needle', 'daily_entry', 'print', 'Needle Daily Entry - Print', 'Print needle daily entry reports'),

  -- Needle: Daily Report
  ('needle.daily_report.view', 'needle', 'daily_report', 'view', 'Needle Daily Report - View', 'View needle daily summary report'),
  ('needle.daily_report.export', 'needle', 'daily_report', 'export', 'Needle Daily Report - Export', 'Export needle daily summary report'),
  ('needle.daily_report.print', 'needle', 'daily_report', 'print', 'Needle Daily Report - Print', 'Print needle daily summary report'),

  -- Needle: Monthly Report
  ('needle.monthly_report.view', 'needle', 'monthly_report', 'view', 'Needle Monthly Report - View', 'View needle monthly summary report'),
  ('needle.monthly_report.export', 'needle', 'monthly_report', 'export', 'Needle Monthly Report - Export', 'Export needle monthly summary report'),
  ('needle.monthly_report.print', 'needle', 'monthly_report', 'print', 'Needle Monthly Report - Print', 'Print needle monthly summary report'),

  -- Broken Needle: Daily Entry
  ('broken.daily_entry.view', 'broken', 'daily_entry', 'view', 'Broken Needle Entry - View', 'View broken needle daily entry'),
  ('broken.daily_entry.create', 'broken', 'daily_entry', 'create', 'Broken Needle Entry - Create', 'Record broken needle transactions'),
  ('broken.daily_entry.edit', 'broken', 'daily_entry', 'edit', 'Broken Needle Entry - Edit', 'Edit broken needle records'),
  ('broken.daily_entry.delete', 'broken', 'daily_entry', 'delete', 'Broken Needle Entry - Delete', 'Delete broken needle records'),
  ('broken.daily_entry.export', 'broken', 'daily_entry', 'export', 'Broken Needle Entry - Export', 'Export broken needle entry data'),
  ('broken.daily_entry.print', 'broken', 'daily_entry', 'print', 'Broken Needle Entry - Print', 'Print broken needle entry slips'),

  -- Broken Needle: Daily Report
  ('broken.daily_report.view', 'broken', 'daily_report', 'view', 'Broken Needle Daily Report - View', 'View broken needle daily report'),
  ('broken.daily_report.export', 'broken', 'daily_report', 'export', 'Broken Needle Daily Report - Export', 'Export broken needle daily report'),
  ('broken.daily_report.print', 'broken', 'daily_report', 'print', 'Broken Needle Daily Report - Print', 'Print broken needle daily report'),

  -- Broken Needle: Monthly Report
  ('broken.monthly_report.view', 'broken', 'monthly_report', 'view', 'Broken Needle Monthly Report - View', 'View broken needle monthly report'),
  ('broken.monthly_report.export', 'broken', 'monthly_report', 'export', 'Broken Needle Monthly Report - Export', 'Export broken needle monthly report'),
  ('broken.monthly_report.print', 'broken', 'monthly_report', 'print', 'Broken Needle Monthly Report - Print', 'Print broken needle monthly report'),

  -- Idle Needle: Daily Entry
  ('idle.daily_entry.view', 'idle', 'daily_entry', 'view', 'Idle Needle Entry - View', 'View idle needle daily entry'),
  ('idle.daily_entry.create', 'idle', 'daily_entry', 'create', 'Idle Needle Entry - Create', 'Record idle needle transactions'),
  ('idle.daily_entry.edit', 'idle', 'daily_entry', 'edit', 'Idle Needle Entry - Edit', 'Edit idle needle entries'),
  ('idle.daily_entry.delete', 'idle', 'daily_entry', 'delete', 'Idle Needle Entry - Delete', 'Delete idle needle entries'),
  ('idle.daily_entry.export', 'idle', 'daily_entry', 'export', 'Idle Needle Entry - Export', 'Export idle needle entries'),
  ('idle.daily_entry.print', 'idle', 'daily_entry', 'print', 'Idle Needle Entry - Print', 'Print idle needle entries'),

  -- Idle Needle: Daily Report
  ('idle.daily_report.view', 'idle', 'daily_report', 'view', 'Idle Needle Daily Report - View', 'View idle needle daily report'),
  ('idle.daily_report.export', 'idle', 'daily_report', 'export', 'Idle Needle Daily Report - Export', 'Export idle needle daily report'),
  ('idle.daily_report.print', 'idle', 'daily_report', 'print', 'Idle Needle Daily Report - Print', 'Print idle needle daily report'),

  -- Idle Needle: Monthly Report
  ('idle.monthly_report.view', 'idle', 'monthly_report', 'view', 'Idle Needle Monthly Report - View', 'View idle needle monthly report'),
  ('idle.monthly_report.export', 'idle', 'monthly_report', 'export', 'Idle Needle Monthly Report - Export', 'Export idle needle monthly report'),
  ('idle.monthly_report.print', 'idle', 'monthly_report', 'print', 'Idle Needle Monthly Report - Print', 'Print idle needle monthly report'),

  -- Report Studio
  ('report_studio.regular.view', 'report_studio', 'regular', 'view', 'Regular Reports - View', 'View standard pre-configured reports'),
  ('report_studio.regular.export', 'report_studio', 'regular', 'export', 'Regular Reports - Export', 'Export standard reports'),
  ('report_studio.custom.view', 'report_studio', 'custom', 'view', 'Custom Reports - View', 'View and execute custom report builder'),
  ('report_studio.custom.create', 'report_studio', 'custom', 'create', 'Custom Reports - Create', 'Build and save new custom report templates'),
  ('report_studio.custom.edit', 'report_studio', 'custom', 'edit', 'Custom Reports - Edit', 'Modify custom report definitions'),
  ('report_studio.custom.delete', 'report_studio', 'custom', 'delete', 'Custom Reports - Delete', 'Remove custom report definitions'),
  ('report_studio.custom.export', 'report_studio', 'custom', 'export', 'Custom Reports - Export', 'Export custom report results'),

  -- Administration: Users
  ('admin.users.view', 'admin', 'users', 'view', 'Employees - View', 'View employee roster and status'),
  ('admin.users.create', 'admin', 'users', 'create', 'Employees - Create', 'Register new employees and create activation tokens'),
  ('admin.users.edit', 'admin', 'users', 'edit', 'Employees - Edit', 'Update employee details and assignments'),
  ('admin.users.disable', 'admin', 'users', 'disable', 'Employees - Disable/Enable', 'Toggle employee account disabled state'),
  ('admin.users.reset_credentials', 'admin', 'users', 'reset_credentials', 'Employees - Reset Credentials', 'Reset credentials and issue recovery token'),
  ('admin.users.view_token', 'admin', 'users', 'view_token', 'Employees - View Token', 'Reveal active one-time activation/recovery tokens'),

  -- Administration: Roles
  ('admin.roles.view', 'admin', 'roles', 'view', 'Roles - View', 'View role catalog and permission matrices'),
  ('admin.roles.create', 'admin', 'roles', 'create', 'Roles - Create', 'Define new application roles'),
  ('admin.roles.edit', 'admin', 'roles', 'edit', 'Roles - Edit', 'Modify role details and assigned permissions'),
  ('admin.roles.delete', 'admin', 'roles', 'delete', 'Roles - Delete', 'Remove non-system roles'),

  -- Administration: Designations
  ('admin.designations.view', 'admin', 'designations', 'view', 'Designations - View', 'View designations master table'),
  ('admin.designations.create', 'admin', 'designations', 'create', 'Designations - Create', 'Create new staff designation entries'),
  ('admin.designations.edit', 'admin', 'designations', 'edit', 'Designations - Edit', 'Update staff designations'),

  -- Administration: Floors
  ('admin.floors.view', 'admin', 'floors', 'view', 'Floors - View', 'View factory floors master list'),
  ('admin.floors.create', 'admin', 'floors', 'create', 'Floors - Create', 'Create new floor entries'),
  ('admin.floors.edit', 'admin', 'floors', 'edit', 'Floors - Edit', 'Update factory floor records'),

  -- Administration: Audit
  ('admin.audit.view', 'admin', 'audit', 'view', 'Audit Log - View', 'Access comprehensive audit trail records'),

  -- Profile
  ('profile.view', 'profile', 'profile', 'view', 'Profile - View', 'View personal employee profile'),
  ('profile.edit', 'profile', 'profile', 'edit', 'Profile - Edit', 'Update personal contact details')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Link ALL permissions to Site Admin role
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Site Admin'
ON CONFLICT DO NOTHING;
