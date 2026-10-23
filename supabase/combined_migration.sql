-- GMS ERP: complete initial setup for Supabase SQL Editor.
-- Includes migrations through 20261023000002, seed data, and the MCD-1255 Site Admin account.
-- Run ONCE on a fresh ERP database. Do not also run the separate SQL files.
-- Existing ERP database: run only migrations/20241001000006_profile_floor_ids.sql for multi-floor support.
-- Creates jzrafiq@gmail.com and its email identity if the Auth user is missing.
-- Sets password 1234 and creates Rafiqul Islam's active Site Admin profile.
-- No manual Auth user creation is required.
-- The core setup and later imports have their own transaction boundaries.

BEGIN;

-- =============================================================================
-- Migration: 20241001000001_profiles.sql
-- Description: Core user profiles table linked to Supabase auth.users
-- Notes:
--   - FK constraints for designation_id, role_id, floor_id are added in
--     migration 20241001000002 after those tables exist.
--   - Passwords are NEVER stored here; all auth is delegated to auth.users.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Helper: generic updated_at trigger function (reused across all migrations)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Generic trigger function that sets updated_at = NOW() before any UPDATE.';

-- ---------------------------------------------------------------------------
-- Table: profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (

  -- Identity
  id                      UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id             TEXT        NOT NULL,
  name                    TEXT        NOT NULL,
  email                   TEXT        NOT NULL,

  -- Relational references
  -- FK constraints are deferred to migration 002 (floors, designations)
  -- and migration 003 (roles) to respect creation order.
  designation_id          UUID        NULL,  -- -> designations.id
  role_id                 UUID        NULL,  -- -> roles.id
  floor_id                UUID        NULL,  -- -> floors.id

  -- Account lifecycle state machine
  account_state           TEXT        NOT NULL DEFAULT 'pending_activation'
                            CONSTRAINT chk_profiles_account_state
                            CHECK (account_state IN (
                              'pending_activation',
                              'active',
                              'credential_reset_required',
                              'disabled'
                            )),
  must_set_password       BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at           TIMESTAMPTZ NULL,
  last_seen_at            TIMESTAMPTZ NULL,

  -- Audit trail columns
  created_by              UUID        NULL REFERENCES auth.users(id),
  updated_by              UUID        NULL REFERENCES auth.users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Uniqueness
  CONSTRAINT uq_profiles_employee_id UNIQUE (employee_id),
  CONSTRAINT uq_profiles_email       UNIQUE (email)
);

COMMENT ON TABLE  public.profiles IS
  'Extended user profile data, linked 1-to-1 with auth.users.';
COMMENT ON COLUMN public.profiles.id IS
  'Mirrors auth.users.id. Row is deleted when the auth user is deleted (CASCADE).';
COMMENT ON COLUMN public.profiles.employee_id IS
  'Human-readable staff identifier assigned by HR, e.g. EMP-001.';
COMMENT ON COLUMN public.profiles.account_state IS
  'Lifecycle state: pending_activation -> active -> disabled | credential_reset_required.';
COMMENT ON COLUMN public.profiles.must_set_password IS
  'When TRUE the user is forced to set a new password on next login.';
COMMENT ON COLUMN public.profiles.designation_id IS
  'FK to designations.id — constraint added in migration 002.';
COMMENT ON COLUMN public.profiles.role_id IS
  'FK to roles.id — constraint added in migration 003.';
COMMENT ON COLUMN public.profiles.floor_id IS
  'FK to floors.id — constraint added in migration 002.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_employee_id    ON public.profiles (employee_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email          ON public.profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id        ON public.profiles (role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_designation_id ON public.profiles (designation_id);
CREATE INDEX IF NOT EXISTS idx_profiles_floor_id       ON public.profiles (floor_id);
CREATE INDEX IF NOT EXISTS idx_profiles_account_state  ON public.profiles (account_state);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at   ON public.profiles (last_seen_at DESC);

-- ---------------------------------------------------------------------------
-- Trigger: keep updated_at current
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Service role: unrestricted — used by Edge Functions / server-side logic
CREATE POLICY "service_role_all_profiles"
  ON public.profiles
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users: read their own row only
CREATE POLICY "authenticated_select_own_profile"
  ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Note: INSERT/UPDATE/DELETE on profiles is performed exclusively through
-- Edge Functions running as service_role. Direct mutations by authenticated
-- users are intentionally prohibited to enforce the admin-managed user flow.

-- =============================================================================
-- Migration: 20241001000002_master_data.sql
-- Description: Lookup/master data tables: floors, designations.
--              Also back-fills FK constraints on profiles that depend on these
--              tables, and the FK for role_id is added in migration 003.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table: floors
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.floors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        NULL,
  name        TEXT        NOT NULL,
  description TEXT        NULL,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_floors_name UNIQUE (name),
  CONSTRAINT uq_floors_code UNIQUE (code)
);

COMMENT ON TABLE  public.floors IS 'Factory/production floors. Used to group staff and needle entries by location.';
COMMENT ON COLUMN public.floors.code       IS 'Optional short code for the floor, e.g. F1, GF.';
COMMENT ON COLUMN public.floors.sort_order IS 'Controls display order in dropdowns (ascending).';

-- ---------------------------------------------------------------------------
-- Indexes: floors
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_floors_active     ON public.floors (active);
CREATE INDEX IF NOT EXISTS idx_floors_sort_order ON public.floors (sort_order);
CREATE INDEX IF NOT EXISTS idx_floors_name       ON public.floors (name);

-- ---------------------------------------------------------------------------
-- Trigger: floors.updated_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_floors_updated_at
  BEFORE UPDATE ON public.floors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: designations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.designations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        NULL,
  name        TEXT        NOT NULL,
  description TEXT        NULL,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_designations_name UNIQUE (name),
  CONSTRAINT uq_designations_code UNIQUE (code)
);

COMMENT ON TABLE  public.designations IS 'Staff job designations/titles, e.g. Operator, Supervisor, QC Inspector.';
COMMENT ON COLUMN public.designations.sort_order IS 'Controls display order in dropdowns (ascending).';

-- ---------------------------------------------------------------------------
-- Indexes: designations
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_designations_active     ON public.designations (active);
CREATE INDEX IF NOT EXISTS idx_designations_sort_order ON public.designations (sort_order);
CREATE INDEX IF NOT EXISTS idx_designations_name       ON public.designations (name);

-- ---------------------------------------------------------------------------
-- Trigger: designations.updated_at
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_designations_updated_at
  BEFORE UPDATE ON public.designations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- FK constraints back-filled onto profiles
-- (deferred from migration 001 because floors/designations did not exist yet)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_designation_id
  FOREIGN KEY (designation_id) REFERENCES public.designations(id)
  ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT fk_profiles_floor_id
  FOREIGN KEY (floor_id) REFERENCES public.floors(id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Row Level Security: floors
-- ---------------------------------------------------------------------------
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;

-- Service role: full access for admin mutations via Edge Functions
CREATE POLICY "service_role_all_floors"
  ON public.floors AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Authenticated users: read active rows (for dropdowns / form selects)
CREATE POLICY "authenticated_select_active_floors"
  ON public.floors AS PERMISSIVE FOR SELECT
  TO authenticated USING (active = true);

-- Admin write operations (create/edit) are routed through Edge Functions
-- that run as service_role after verifying the caller holds the appropriate
-- admin.floors.* permission. Direct INSERT/UPDATE/DELETE by authenticated
-- users is intentionally blocked here.

-- ---------------------------------------------------------------------------
-- Row Level Security: designations
-- ---------------------------------------------------------------------------
ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_designations"
  ON public.designations AS PERMISSIVE FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_select_active_designations"
  ON public.designations AS PERMISSIVE FOR SELECT
  TO authenticated USING (active = true);

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

-- =============================================================================
-- Migration: 20241001000004_tokens.sql
-- Description: Encrypted one-time access tokens for activation and recovery.
--              Tokens are stored encrypted at rest (AES-256-GCM).
--              Never stored in plaintext. Disposed (token_encrypted=NULL) on use.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_access_tokens (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_encrypted   TEXT        NULL,
  token_fingerprint TEXT        NULL,
  purpose           TEXT        NOT NULL CONSTRAINT chk_tokens_purpose CHECK (purpose IN ('activation', 'recovery')),
  status            TEXT        NOT NULL DEFAULT 'active' CONSTRAINT chk_tokens_status CHECK (status IN ('active', 'used', 'revoked', 'expired')),
  expires_at        TIMESTAMPTZ NULL,
  used_at           TIMESTAMPTZ NULL,
  revoked_at        TIMESTAMPTZ NULL,
  created_by        UUID        NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.user_access_tokens IS 'One-time activation and password recovery tokens encrypted at rest.';
COMMENT ON COLUMN public.user_access_tokens.token_encrypted IS 'AES-256-GCM encrypted payload (iv:tag:ciphertext). Nullified once used.';
COMMENT ON COLUMN public.user_access_tokens.token_fingerprint IS 'Non-secret first 4 characters for UI identification, e.g. A7K9.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tokens_user_id           ON public.user_access_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_status            ON public.user_access_tokens (status);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at        ON public.user_access_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_tokens_user_purpose_stat ON public.user_access_tokens (user_id, purpose, status);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_access_tokens ENABLE ROW LEVEL SECURITY;

-- Tokens are strictly managed server-side via service_role to avoid any browser leakage
CREATE POLICY "service_role_all_user_access_tokens"
  ON public.user_access_tokens
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- Migration: 20241001000005_audit.sql
-- Description: Audit trail logs. Immutable records of system operations.
--              No plaintext passwords or tokens are ever recorded.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id  UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type      TEXT        NOT NULL,
  entity_type     TEXT        NULL,
  entity_id       TEXT        NULL,
  old_data        JSONB       NULL,
  new_data        JSONB       NULL,
  metadata        JSONB       NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.audit_logs IS 'Append-only enterprise audit trail. Captures operational events.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_created_at    ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_id      ON public.audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_target_id     ON public.audit_logs (target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_event_type    ON public.audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_entity_lookup ON public.audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: Append-only, viewable by authorized admins
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_audit_logs"
  ON public.audit_logs
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users cannot directly delete or update audit logs
CREATE POLICY "authenticated_select_audit_logs"
  ON public.audit_logs
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================================================
-- Migration: 20241001000006_profile_floor_ids.sql
-- Adds multi-floor assignments to existing and new ERP databases.
-- Safe to rerun. Preserves existing assignments and does not change accounts.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS floor_ids UUID[] NOT NULL DEFAULT '{}'::UUID[];

-- Retain the original single-floor assignment when upgrading older profiles.
-- Also repair a nullable floor_ids column from an earlier manual migration.
UPDATE public.profiles
SET floor_ids = CASE
  WHEN floor_id IS NOT NULL THEN ARRAY[floor_id]
  ELSE '{}'::UUID[]
END
WHERE floor_ids IS NULL
   OR (cardinality(floor_ids) = 0 AND floor_id IS NOT NULL);

ALTER TABLE public.profiles
  ALTER COLUMN floor_ids SET DEFAULT '{}'::UUID[],
  ALTER COLUMN floor_ids SET NOT NULL;

COMMENT ON COLUMN public.profiles.floor_ids IS
  'Array of assigned floor UUIDs supporting multi-floor personnel.';

CREATE INDEX IF NOT EXISTS idx_profiles_floor_ids
  ON public.profiles USING GIN (floor_ids);

NOTIFY pgrst, 'reload schema';

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

-- Migrations and seed data are included above.
-- Creates the Auth user and email identity if missing; no dashboard step needed.
-- This script sets their password to 1234 and creates an active ERP profile.
-- Prepared for Rafiqul Islam (MCD-1255), Site Admin with full access.
-- The password is hashed with bcrypt before storage in Supabase Auth.
-- Role examples: Site Admin (full access), Needle Manager, Floor Operator, Auditor.
-- Non-admin roles need permissions configured under Administration > Roles.
-- This creates a NEW profile; it never overwrites or promotes an existing one.

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
    (id, employee_id, name, email, role_id, floor_ids, account_state, must_set_password)
  VALUES
    (v_user_id, v_employee_id, v_name, v_auth_email, v_role_id, '{}', 'active', false);

  INSERT INTO public.audit_logs
    (target_user_id, event_type, entity_type, entity_id, metadata)
  VALUES
    (v_user_id, 'USER_CREATED', 'profile', v_user_id::text,
     jsonb_build_object('source', 'sql_editor', 'employee_id', v_employee_id, 'role', v_role_name));

  RAISE NOTICE 'ERP profile created. Sign in with Employee ID: % and the password configured in this script.', v_employee_id;
END;
$$;

COMMIT;


-- =============================================================================
-- Migration: 20241001000007_floor_locations.sql (Phase 1.1)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.floor_locations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT        NULL,
  name        TEXT        NOT NULL,
  description TEXT        NULL,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_floor_locations_name UNIQUE (name),
  CONSTRAINT uq_floor_locations_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_floor_locations_active     ON public.floor_locations (active);
CREATE INDEX IF NOT EXISTS idx_floor_locations_sort_order ON public.floor_locations (sort_order);
CREATE INDEX IF NOT EXISTS idx_floor_locations_name       ON public.floor_locations (name);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_floor_locations_updated_at'
  ) THEN
    CREATE TRIGGER trg_floor_locations_updated_at
      BEFORE UPDATE ON public.floor_locations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.floor_locations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'floor_locations' AND policyname = 'service_role_all_floor_locations'
  ) THEN
    CREATE POLICY "service_role_all_floor_locations"
      ON public.floor_locations AS PERMISSIVE FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'floor_locations' AND policyname = 'authenticated_select_floor_locations'
  ) THEN
    CREATE POLICY "authenticated_select_floor_locations"
      ON public.floor_locations AS PERMISSIVE FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

ALTER TABLE public.floors
  ADD COLUMN IF NOT EXISTS floor_location_id UUID REFERENCES public.floor_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_floors_floor_location_id
  ON public.floors (floor_location_id);

-- Seed Floor Locations
INSERT INTO public.floor_locations (code, name, description, active, sort_order)
VALUES
  ('LOC-B02',  'Building 02',          'Main Manufacturing & Sewing Facility',       true, 1),
  ('LOC-B04',  'Building 04',          'Assembly & Finishing Complex',               true, 2),
  ('LOC-B03',  'Building 03',          'Special Operations & Technical Unit',        true, 3),
  ('LOC-B01',  'Building 01',          'Embroidery & Foundation Training Centre',    true, 4),
  ('LOC-B6A',  'Building 6A',          'Production Block 6A',                        true, 5),
  ('LOC-B6B',  'Building 6B',          'Production Block 6B',                        true, 6),
  ('LOC-B09',  'Building 09',          'High Capacity Sewing Unit 09',               true, 7),
  ('LOC-B03S', 'Building 03 (Sample)', 'Sample Development Section & Tech Lab',      true, 8)
ON CONFLICT (name) DO UPDATE SET
  code        = EXCLUDED.code,
  description = EXCLUDED.description,
  active      = true,
  sort_order  = EXCLUDED.sort_order;

-- Connect Floors to Floor Locations
INSERT INTO public.floors (code, name, floor_location_id, description, active, sort_order)
VALUES
  ('FL-A',   'A Floor',          (SELECT id FROM public.floor_locations WHERE name = 'Building 02'),          'Sewing & Assembly Floor A',          true, 1),
  ('FL-B',   'B Floor',          (SELECT id FROM public.floor_locations WHERE name = 'Building 02'),          'Sewing & Assembly Floor B',          true, 2),
  ('FL-C',   'C Floor',          (SELECT id FROM public.floor_locations WHERE name = 'Building 04'),          'Finishing & Inspection Floor C',     true, 3),
  ('FL-D',   'D Floor',          (SELECT id FROM public.floor_locations WHERE name = 'Building 04'),          'Sample Section & Technical Floor D', true, 4),
  ('FL-E',   'E Floor',          (SELECT id FROM public.floor_locations WHERE name = 'Building 03'),          'Production Floor E',                 true, 5),
  ('FL-EMB', 'EMB',              (SELECT id FROM public.floor_locations WHERE name = 'Building 01'),          'Embroidery Department',              true, 6),
  ('FL-TC',  'Training Centre',  (SELECT id FROM public.floor_locations WHERE name = 'Building 01'),          'Staff Training & Development Unit',  true, 7),
  ('FL-F',   'F Floor',          (SELECT id FROM public.floor_locations WHERE name = 'Building 6A'),          'Production Floor F',                 true, 8),
  ('FL-G',   'G Floor',          (SELECT id FROM public.floor_locations WHERE name = 'Building 6A'),          'Production Floor G',                 true, 9),
  ('FL-H',   'H Floor',          (SELECT id FROM public.floor_locations WHERE name = 'Building 6B'),          'Production Floor H',                 true, 10),
  ('FL-I',   'I Floor',          (SELECT id FROM public.floor_locations WHERE name = 'Building 6B'),          'Production Floor I',                 true, 11),
  ('FL-J',   'J Floor',          (SELECT id FROM public.floor_locations WHERE name = 'Building 09'),          'Production Floor J',                 true, 12),
  ('FL-K',   'K Floor',          (SELECT id FROM public.floor_locations WHERE name = 'Building 09'),          'Production Floor K',                 true, 13),
  ('FL-SMP', 'Sample Floor',     (SELECT id FROM public.floor_locations WHERE name = 'Building 03 (Sample)'), 'Sample Development Floor',           true, 14)
ON CONFLICT (name) DO UPDATE SET
  floor_location_id = EXCLUDED.floor_location_id,
  code              = COALESCE(floors.code, EXCLUDED.code),
  sort_order        = EXCLUDED.sort_order;

-- Permissions for Floor Locations
INSERT INTO public.permissions (key, module, page, action, label, description)
VALUES
  ('admin.floor_locations.view',   'admin', 'floor_locations', 'view',   'Floor Locations - View',   'View factory floor locations and buildings'),
  ('admin.floor_locations.create', 'admin', 'floor_locations', 'create', 'Floor Locations - Create', 'Create new factory floor locations and buildings'),
  ('admin.floor_locations.edit',   'admin', 'floor_locations', 'edit',   'Floor Locations - Edit',   'Update factory floor locations and buildings')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Site Admin'
  AND p.key IN (
    'admin.floor_locations.view',
    'admin.floor_locations.create',
    'admin.floor_locations.edit'
  )
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';


-- =============================================================================
-- PHASE 1.2: NEEDLE MANAGEMENT MASTER DATA
-- =============================================================================

-- =============================================================================
-- Migration: 20241001000008_needle_master.sql
-- Description: Creates Needle Master (needle_items) and Floor Assignments
--              (needle_floor_assignments) tables, seeds unitPrice.xlsx master data,
--              initializes floor assignments, and registers granular permissions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table: needle_items (Master Needle Catalog)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.needle_items (
  id                      UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  description_item        TEXT           NOT NULL DEFAULT 'GMTS SEWING NEEDLE',
  item_code               TEXT           NOT NULL,
  tac_inventory_item_code TEXT           NULL,
  needle_type             TEXT           NOT NULL,
  size_dia                TEXT           NOT NULL,
  brand                   TEXT           NOT NULL,
  unit_price_bdt          NUMERIC(14, 4) NOT NULL DEFAULT 0,
  unit_price_usd          NUMERIC(14, 6) NOT NULL DEFAULT 0,
  active                  BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_needle_items_item_code UNIQUE (item_code)
);

COMMENT ON TABLE  public.needle_items IS 'Master catalog of garment sewing needles with specifications and unit prices.';
COMMENT ON COLUMN public.needle_items.item_code IS 'Unique internal needle item code used across daily entries and transactions.';
COMMENT ON COLUMN public.needle_items.tac_inventory_item_code IS 'Optional reference code from TAC inventory system.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_needle_items_code   ON public.needle_items (item_code);
CREATE INDEX IF NOT EXISTS idx_needle_items_tac    ON public.needle_items (tac_inventory_item_code);
CREATE INDEX IF NOT EXISTS idx_needle_items_type   ON public.needle_items (needle_type);
CREATE INDEX IF NOT EXISTS idx_needle_items_brand  ON public.needle_items (brand);
CREATE INDEX IF NOT EXISTS idx_needle_items_size   ON public.needle_items (size_dia);
CREATE INDEX IF NOT EXISTS idx_needle_items_active ON public.needle_items (active);

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_needle_items_updated_at'
  ) THEN
    CREATE TRIGGER trg_needle_items_updated_at
      BEFORE UPDATE ON public.needle_items
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.needle_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'needle_items' AND policyname = 'service_role_all_needle_items'
  ) THEN
    CREATE POLICY "service_role_all_needle_items"
      ON public.needle_items AS PERMISSIVE FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'needle_items' AND policyname = 'authenticated_select_needle_items'
  ) THEN
    CREATE POLICY "authenticated_select_needle_items"
      ON public.needle_items AS PERMISSIVE FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Table: needle_floor_assignments (Floor & Group Mapping)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.needle_floor_assignments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  needle_item_id  UUID        NOT NULL REFERENCES public.needle_items(id) ON DELETE CASCADE,
  floor_id        UUID        NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  needle_group    TEXT        NOT NULL CHECK (needle_group IN ('needle', 'ideal_needle')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_needle_floor_group UNIQUE (needle_item_id, floor_id, needle_group)
);

COMMENT ON TABLE public.needle_floor_assignments IS 'Associates master needles with specific factory production floors for Needle and Ideal Needle groups.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nfa_needle_item_id ON public.needle_floor_assignments (needle_item_id);
CREATE INDEX IF NOT EXISTS idx_nfa_floor_id       ON public.needle_floor_assignments (floor_id);
CREATE INDEX IF NOT EXISTS idx_nfa_needle_group   ON public.needle_floor_assignments (needle_group);
CREATE INDEX IF NOT EXISTS idx_nfa_group_floor    ON public.needle_floor_assignments (needle_group, floor_id);

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_needle_floor_assignments_updated_at'
  ) THEN
    CREATE TRIGGER trg_needle_floor_assignments_updated_at
      BEFORE UPDATE ON public.needle_floor_assignments
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.needle_floor_assignments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'needle_floor_assignments' AND policyname = 'service_role_all_needle_floor_assignments'
  ) THEN
    CREATE POLICY "service_role_all_needle_floor_assignments"
      ON public.needle_floor_assignments AS PERMISSIVE FOR ALL
      TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'needle_floor_assignments' AND policyname = 'authenticated_select_needle_floor_assignments'
  ) THEN
    CREATE POLICY "authenticated_select_needle_floor_assignments"
      ON public.needle_floor_assignments AS PERMISSIVE FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Register Permissions for Needle Management & Ideal Needle
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (key, module, page, action, label, description)
VALUES
  ('needle_management.needle.view',         'needle_management', 'needle',       'view',   'Needle Master - View',         'View needle master items and floor assignments'),
  ('needle_management.needle.create',       'needle_management', 'needle',       'create', 'Needle Master - Create',       'Create new needle master items and floor assignments'),
  ('needle_management.needle.edit',         'needle_management', 'needle',       'edit',   'Needle Master - Edit',         'Update needle master properties and floor assignments'),
  ('needle_management.needle.delete',       'needle_management', 'needle',       'delete', 'Needle Master - Delete',       'Delete or deactivate needle items'),
  ('needle_management.ideal_needle.view',   'needle_management', 'ideal_needle', 'view',   'Ideal Needle Master - View',   'View ideal needle master items and floor assignments'),
  ('needle_management.ideal_needle.create', 'needle_management', 'ideal_needle', 'create', 'Ideal Needle Master - Create', 'Create ideal needle master items and floor assignments'),
  ('needle_management.ideal_needle.edit',   'needle_management', 'ideal_needle', 'edit',   'Ideal Needle Master - Edit',   'Update ideal needle properties and floor assignments'),
  ('needle_management.ideal_needle.delete', 'needle_management', 'ideal_needle', 'delete', 'Ideal Needle Master - Delete', 'Delete or deactivate ideal needle items')
ON CONFLICT (key) DO NOTHING;

-- Grant to Site Admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Site Admin'
  AND p.key LIKE 'needle_management.%'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Seed Needle Master Items from unitPrice.xlsx (358 items)
-- ---------------------------------------------------------------------------

INSERT INTO public.needle_items (
  description_item, item_code, tac_inventory_item_code, needle_type, size_dia, brand, unit_price_bdt, unit_price_usd, active
) VALUES
  ('GMTS SEWING NEEDLE', 'SN-001', 'SNG-001', 'DB X 1', '7', 'GROZ(FFG)', 6.3377, 0.051694, true),
  ('GMTS SEWING NEEDLE', 'SN-002', NULL, 'DB X 1', '7', 'GROZ(RG)', 6.3377, 0.051694, true),
  ('GMTS SEWING NEEDLE', 'SN-003', 'SNO-002', 'DB X 1', '7', 'ORGAN', 4.9813, 0.040631, true),
  ('GMTS SEWING NEEDLE', 'SN-004', 'SNO-001', 'DB X 1 SPD/SPD+', '7', 'ORGAN', 10.1530, 0.082814, true),
  ('GMTS SEWING NEEDLE', 'SN-005', NULL, 'DB X 1 KN PD', '7', 'ORGAN', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-006', 'SNG-002', 'DB X 1 SAN 10', '7', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-011', NULL, 'DB X 1', '8', 'GROZ(FFG)', 4.3000, 0.035073, true),
  ('GMTS SEWING NEEDLE', 'SN-012', NULL, 'DB X 1 SAN 10', '8', 'GROZ(FFG)', 6.2000, 0.050571, true),
  ('GMTS SEWING NEEDLE', 'SN-013', 'SNO-004', 'DB X 1', '8', 'ORGAN', 8.1300, 0.066313, true),
  ('GMTS SEWING NEEDLE', 'SN-014', 'SNO-003', 'DB X 1 SF', '8', 'ORGAN', 7.4812, 0.061021, true),
  ('GMTS SEWING NEEDLE', 'SN-015', 'SNO-005', 'DB X K 5 KN', '8', 'ORGAN', 5.3000, 0.043230, true),
  ('GMTS SEWING NEEDLE', 'SN-016', 'SNO-181', 'DB X 1 SPD/SPD+', '8', 'ORGAN', 11.0000, 0.089723, true),
  ('GMTS SEWING NEEDLE', 'SN-017', NULL, 'DB X 1 KN PD', '8', 'ORGAN', 10.3000, 0.084013, true),
  ('GMTS SEWING NEEDLE', 'SN-018', 'SNG-053', 'DB X 1 SAN 10 XS', '8', 'GROZ(FFG)', 6.2000, 0.050571, true),
  ('GMTS SEWING NEEDLE', 'SN-019', 'SNO-089', 'DB X 1 KN', '8 LP', 'ORGAN', 12.5000, 0.101958, true),
  ('GMTS SEWING NEEDLE', 'SN-020', NULL, 'DB X 1 K5 NY', '8', 'ORGAN', 5.3000, 0.043230, true),
  ('GMTS SEWING NEEDLE', 'SN-025', NULL, 'DB X 1', '9', 'GROZ(FFG)', 5.8000, 0.047308, true),
  ('GMTS SEWING NEEDLE', 'SN-026', NULL, 'DB X 1', '9', 'GROZ(RG)', 5.8000, 0.047308, true),
  ('GMTS SEWING NEEDLE', 'SN-027', NULL, 'DB X 1 SAN 10', '9', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-028', NULL, 'DB X K5', '9', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-029', 'SNO-007', 'DB X 1', '9', 'ORGAN', 8.1910, 0.066811, true),
  ('GMTS SEWING NEEDLE', 'SN-030', NULL, 'DB X 1-KN', '9', 'GROZ(FFG)', 4.3000, 0.035073, true),
  ('GMTS SEWING NEEDLE', 'SN-031', 'SNO-008', 'DB X 1-KN', '9', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-032', 'SNO-006', 'DB X 1-SF', '9', 'ORGAN', 9.0000, 0.073409, true),
  ('GMTS SEWING NEEDLE', 'SN-033', 'SNG-005', 'DB X K 5 KK', '9', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-034', 'SNO-009', 'DB X K 5 KK', '9', 'ORGAN', 5.2800, 0.043067, true),
  ('GMTS SEWING NEEDLE', 'SN-035', 'SNG-055', 'DB X 1 SAN 10 XS', '9', 'GROZ(FFG)', 6.2000, 0.050571, true),
  ('GMTS SEWING NEEDLE', 'SN-036', 'SNO-090', 'DB X 1 KN', '9LP', 'ORGAN', 11.7627, 0.095944, true),
  ('GMTS SEWING NEEDLE', 'SN-041', NULL, 'DB X 1', '10', 'GROZ(FFG)', 9.6800, 0.078956, true),
  ('GMTS SEWING NEEDLE', 'SN-042', NULL, 'DB X 1', '10', 'GROZ(RG)', 9.6800, 0.078956, true),
  ('GMTS SEWING NEEDLE', 'SN-043', 'SNO-010', 'DB X 1', '10', 'ORGAN', 8.1300, 0.066313, true),
  ('GMTS SEWING NEEDLE', 'SN-044', NULL, 'DB X 1-KN', '10', 'GROZ(FFG)', 4.2492, 0.034659, true),
  ('GMTS SEWING NEEDLE', 'SN-045', 'SNG-007', 'DB X K5 KK', '10', 'GROZ(FFG)', 4.3000, 0.035073, true),
  ('GMTS SEWING NEEDLE', 'SN-046', NULL, 'DB X 1-KN', '10', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-047', NULL, 'DB X 1- SAN KN', '10', 'ORGAN', 6.2000, 0.050571, true),
  ('GMTS SEWING NEEDLE', 'SN-048', 'SNO-122', 'DB X 1-KN', '10 LP', 'ORGAN', 16.5670, 0.135131, true),
  ('GMTS SEWING NEEDLE', 'SN-053', NULL, 'DB X 1', '11', 'GROZ(FFG)', 4.3000, 0.035073, true),
  ('GMTS SEWING NEEDLE', 'SN-054', NULL, 'DB X 1 K5', '11', 'GROZ(FFG)', 3.2000, 0.026101, true),
  ('GMTS SEWING NEEDLE', 'SN-055', NULL, 'DB X 1', '11', 'GROZ(RG)', 4.3000, 0.035073, true),
  ('GMTS SEWING NEEDLE', 'SN-056', 'SNO-012', 'DB X 1', '11', 'ORGAN', 8.1300, 0.066313, true),
  ('GMTS SEWING NEEDLE', 'SN-057', NULL, 'DB X 5-K', '11', 'ORGAN', 4.3000, 0.035073, true),
  ('GMTS SEWING NEEDLE', 'SN-058', 'SNO-120', 'DB X K5 KK', '11', 'ORGAN', 8.1300, 0.066313, true),
  ('GMTS SEWING NEEDLE', 'SN-059', 'SNO-123', 'DB X 1 KN', '11 LP', 'ORGAN', 14.8000, 0.120718, true),
  ('GMTS SEWING NEEDLE', 'SN-064', 'SNG-008', 'DB X 1', '12', 'GROZ(FFG)', 4.3000, 0.035073, true),
  ('GMTS SEWING NEEDLE', 'SN-065', 'SNO-118', 'DB X 1', '12', 'ORGAN', 8.1300, 0.066313, true),
  ('GMTS SEWING NEEDLE', 'SN-070', 'SNG-009', 'DB X 1', '14', 'GROZ(FFG)', 4.1257, 0.033652, true),
  ('GMTS SEWING NEEDLE', 'SN-071', 'SNG-089', 'DB X 1', '14', 'GROZ(GEBEDUR)', 4.3000, 0.035073, true),
  ('GMTS SEWING NEEDLE', 'SN-072', NULL, 'DB X 1', '14', 'ORGAN', 4.3000, 0.035073, true),
  ('GMTS SEWING NEEDLE', 'SN-075', 'SNG-010', 'DB X 1', '18', 'GROZ(FFG)', 3.7886, 0.030902, true),
  ('GMTS SEWING NEEDLE', 'SN-076', NULL, 'DB X 1', '18', 'ORGAN', 4.3000, 0.035073, true)
ON CONFLICT (item_code) DO UPDATE SET
  description_item        = EXCLUDED.description_item,
  tac_inventory_item_code = EXCLUDED.tac_inventory_item_code,
  needle_type             = EXCLUDED.needle_type,
  size_dia                = EXCLUDED.size_dia,
  brand                   = EXCLUDED.brand,
  unit_price_bdt          = EXCLUDED.unit_price_bdt,
  unit_price_usd          = EXCLUDED.unit_price_usd,
  active                  = true;

INSERT INTO public.needle_items (
  description_item, item_code, tac_inventory_item_code, needle_type, size_dia, brand, unit_price_bdt, unit_price_usd, active
) VALUES
  ('GMTS SEWING NEEDLE', 'SN-078', NULL, 'PH - C70 -', '14', 'GROZ(FFG)', 91.1000, 0.743067, true),
  ('GMTS SEWING NEEDLE', 'SN-079', 'SNO-040', 'PH - C70 -', '14', 'ORGAN', 96.2268, 0.784884, true),
  ('GMTS SEWING NEEDLE', 'SN-081', NULL, 'PH - C70 -', '16', 'GROZ(FFG)', 85.8500, 0.700245, true),
  ('GMTS SEWING NEEDLE', 'SN-082', 'SNO-041', 'PH - C70 -', '16', 'ORGAN', 34.9699, 0.285236, true),
  ('GMTS SEWING NEEDLE', 'SN-084', 'SNG-011', 'DC X 1', '7', 'GROZ(FFG)', 7.2901, 0.059463, true),
  ('GMTS SEWING NEEDLE', 'SN-085', 'SNO-013', 'DC X 1', '7', 'ORGAN', 9.9620, 0.081256, true),
  ('GMTS SEWING NEEDLE', 'SN-086', 'SNG-062', 'DC X 1 SAN 10', '7', 'GROZ(FFG)', 9.5000, 0.077488, true),
  ('GMTS SEWING NEEDLE', 'SN-090', 'SNG-012', 'DC X 1', '8', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-091', NULL, 'DC X 1', '8', 'GROZ(RG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-092', 'SNO-015', 'DC X 1', '8', 'ORGAN', 13.2952, 0.108444, true),
  ('GMTS SEWING NEEDLE', 'SN-093', NULL, 'DC X 1-KN', '8', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-094', 'SNO-016', 'DC X 1-KN', '8', 'ORGAN', 12.0000, 0.097879, true),
  ('GMTS SEWING NEEDLE', 'SN-095', 'SNO-014', 'DC X 1-SF', '8', 'ORGAN', 23.3235, 0.190241, true),
  ('GMTS SEWING NEEDLE', 'SN-096', NULL, 'DC X 1 SAN KK', '8', 'ORGAN', 11.9500, 0.097471, true),
  ('GMTS SEWING NEEDLE', 'SN-097', NULL, 'DC X 1 SPD', '8', 'ORGAN', 14.0000, 0.114192, true),
  ('GMTS SEWING NEEDLE', 'SN-098', NULL, 'DC X 1KN PD', '8', 'ORGAN', 14.5000, 0.118271, true),
  ('GMTS SEWING NEEDLE', 'SN-099', 'SNG-013', 'DC X 1 27 SAN 10', '8', 'GROZ(FFG)', 9.8000, 0.079935, true),
  ('GMTS SEWING NEEDLE', 'SN-100', 'SNG-063', 'DC X 1 27 SAN 10 XS', '8', 'GROZ(FFG)', 8.5000, 0.069331, true),
  ('GMTS SEWING NEEDLE', 'SN-101', 'SNO-097', 'DC X 1-KN', '8 LP', 'ORGAN', 22.7323, 0.185418, true),
  ('GMTS SEWING NEEDLE', 'SN-105', NULL, 'DC X 1', '9', 'GROZ(FFG)', 9.6800, 0.078956, true),
  ('GMTS SEWING NEEDLE', 'SN-106', NULL, 'DC X 1', '9', 'GROZ(RG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-107', 'SNO-017', 'DC X 1', '9', 'ORGAN', 13.9371, 0.113679, true),
  ('GMTS SEWING NEEDLE', 'SN-108', NULL, 'DC X 1', '9', 'ORGAN(RG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-109', 'SNG-015', 'DC X1 B 27 SAN 10', '9', 'GROZ(FFG)', 10.5600, 0.086134, true),
  ('GMTS SEWING NEEDLE', 'SN-110', NULL, 'DC X1 SAN 10 XS', '9', 'GROZ(FFG)', 10.5600, 0.086134, true),
  ('GMTS SEWING NEEDLE', 'SN-111', 'SNO-094', 'DC X 1 SF', '9', 'ORGAN', 1.9800, 0.016150, true),
  ('GMTS SEWING NEEDLE', 'SN-112', NULL, 'DC X 1 KN', '9', 'ORGAN', 1.9800, 0.016150, true),
  ('GMTS SEWING NEEDLE', 'SN-113', 'SNO-098', 'DC X 1 KN', '9 LP', 'ORGAN', 24.1309, 0.196826, true),
  ('GMTS SEWING NEEDLE', 'SN-114', 'SNO-096', 'DC X 1 KN PD', '9', 'ORGAN', 19.5000, 0.159054, true),
  ('GMTS SEWING NEEDLE', 'SN-118', 'SNG-016', 'DC X 1', '10', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-119', 'SNO-018', 'DC X 1', '10', 'ORGAN', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-120', 'SNG-017', 'DC X 1 27 SAN 10', '10', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-121', NULL, 'DC X 1 SAN 10  XS', '10', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-122', 'SNO-099', 'DC X 1 KN', '10LP', 'ORGAN', 24.1672, 0.197122, true),
  ('GMTS SEWING NEEDLE', 'SN-125', 'SNG-018', 'DC X 1', '11', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-126', 'SNO-019', 'DC X 1', '11', 'ORGAN', 13.9371, 0.113679, true),
  ('GMTS SEWING NEEDLE', 'SN-127', NULL, 'DC X 1-KN', '11', 'GROZ(FFG)', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-128', 'SNO-020', 'DC X 1-KN', '11', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-132', 'SNG-019', 'DC X 1', '12', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-133', 'SNO-119', 'DC X 1', '12', 'ORGAN', 10.5400, 0.085971, true),
  ('GMTS SEWING NEEDLE', 'SN-135', 'SNG-020', 'DC X 1', '14', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-136', 'SNO-021', 'DC X 1', '14', 'ORGAN', 13.3406, 0.108814, true),
  ('GMTS SEWING NEEDLE', 'SN-137', NULL, 'DC X 1', '14', 'GROZ(GEBEDUR)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-139', NULL, 'UY X 128', '7', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-140', 'SNO-054', 'UY X 128', '7', 'ORGAN', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-141', NULL, 'UY X 128-KN', '7', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-142', 'SNO-056', 'UY X 128-KN', '7', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-143', 'SNG-044', 'UY X 128- SAN-10', '7', 'GROZ(FFG)', 7.2446, 0.059092, true),
  ('GMTS SEWING NEEDLE', 'SN-146', 'SNG-065', 'UY X 128', '8', 'GROZ(FFG)', 10.0000, 0.081566, true),
  ('GMTS SEWING NEEDLE', 'SN-147', 'SNO-058', 'UY X 128', '8', 'ORGAN', 10.0000, 0.081566, true)
ON CONFLICT (item_code) DO UPDATE SET
  description_item        = EXCLUDED.description_item,
  tac_inventory_item_code = EXCLUDED.tac_inventory_item_code,
  needle_type             = EXCLUDED.needle_type,
  size_dia                = EXCLUDED.size_dia,
  brand                   = EXCLUDED.brand,
  unit_price_bdt          = EXCLUDED.unit_price_bdt,
  unit_price_usd          = EXCLUDED.unit_price_usd,
  active                  = true;

INSERT INTO public.needle_items (
  description_item, item_code, tac_inventory_item_code, needle_type, size_dia, brand, unit_price_bdt, unit_price_usd, active
) VALUES
  ('GMTS SEWING NEEDLE', 'SN-148', NULL, 'UY X 128-KN', '8', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-149', 'SNO-060', 'UY X 128-KN', '8', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-150', 'SNO-087', 'UY X 128- GAS KN', '8 LP', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-151', NULL, 'UY X 128- KK - KN', '8', 'GROZ(FFG)', 7.5000, 0.061175, true),
  ('GMTS SEWING NEEDLE', 'SN-152', 'SNO-059', 'UY X 128- KK - KN', '8', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-153', 'SNO-057', 'UY X 128 GAS SPD+/SPD', '8', 'ORGAN', 17.5000, 0.142741, true),
  ('GMTS SEWING NEEDLE', 'SN-154', NULL, 'UY X 128  KN PD', '8', 'ORGAN', 18.0000, 0.146819, true),
  ('GMTS SEWING NEEDLE', 'SN-155', 'SNO-100', 'UY X 128- SF', '8', 'ORGAN', 17.3555, 0.141562, true),
  ('GMTS SEWING NEEDLE', 'SN-156', 'SNO-103', 'UY X 128- GAS SF', '8 LP', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-157', 'SNG-067', 'UY X 128  SAN 10', '8', 'GROZ(FFG)', 10.4000, 0.084829, true),
  ('GMTS SEWING NEEDLE', 'SN-158', NULL, 'UY X 128  SAN 10 XS', '8', 'GROZ(FFG)', 10.4000, 0.084829, true),
  ('GMTS SEWING NEEDLE', 'SN-161', 'SNG-045', 'UY X 128 SAN 10', '9', 'GROZ(FFG)', 11.2070, 0.091411, true),
  ('GMTS SEWING NEEDLE', 'SN-162', 'SNG-066', 'UY X 128', '9', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-163', 'SNO-061', 'UY X 128', '9', 'ORGAN', 20.0970, 0.163923, true),
  ('GMTS SEWING NEEDLE', 'SN-164', NULL, 'UY X 128', '9 J', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-165', 'SNG-046', 'UY X 128', '9', 'GROZ(GEBEDUR)', 11.2949, 0.092128, true),
  ('GMTS SEWING NEEDLE', 'SN-166', NULL, 'UY X 128-KN', '9', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-167', NULL, 'UY X 128-KN', '9', 'ORGAN', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-168', NULL, 'UY X 128- KK - KN', '9', 'GROZ(FFG)', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-169', 'SNO-064', 'UY X 128- KK - KN', '9', 'ORGAN', 10.2831, 0.083875, true),
  ('GMTS SEWING NEEDLE', 'SN-170', NULL, 'UY X 128 -NY', '9 S', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-171', 'SNO-065', 'UY X 128 -LE', '9', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-172', 'SNO-063', 'UY X 128 GAS SPD', '9', 'ORGAN', 16.3454, 0.133323, true),
  ('GMTS SEWING NEEDLE', 'SN-173', NULL, 'UY X 128 GAS KNPD', '9', 'ORGAN', 21.5000, 0.175367, true),
  ('GMTS SEWING NEEDLE', 'SN-174', NULL, 'UY X 128-KK', '9', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-175', 'SNO-107', 'UY X 128 GAS KN', '9 LP', 'ORGAN', 22.9937, 0.187550, true),
  ('GMTS SEWING NEEDLE', 'SN-176', 'SNO-101', 'UY X 128 SF', '9', 'ORGAN', 16.6880, 0.136117, true),
  ('GMTS SEWING NEEDLE', 'SN-177', 'SNG-069', 'UY X 128 SAN 10 XS', '9', 'GROZ(FFG)', 10.3825, 0.084686, true),
  ('GMTS SEWING NEEDLE', 'SN-178', 'SNO-104', 'UY X 128 SF', '9 LP', 'ORGAN', 27.7200, 0.226101, true),
  ('GMTS SEWING NEEDLE', 'SN-179', 'SNO-106', 'UY X 128 -LE-SPD', '9', 'ORGAN', 26.3000, 0.214519, true),
  ('GMTS SEWING NEEDLE', 'SN-181', NULL, 'UY X 128 SAN 10', '10', 'GROZ(FFG)', 12.9800, 0.105873, true),
  ('GMTS SEWING NEEDLE', 'SN-182', NULL, 'UY X 128', '10', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-183', 'SNO-072', 'UY X 128', '10', 'ORGAN', 18.2344, 0.148731, true),
  ('GMTS SEWING NEEDLE', 'SN-184', 'SNO-067', 'UY X 128 -NY2', '10', 'ORGAN', 16.2893, 0.132865, true),
  ('GMTS SEWING NEEDLE', 'SN-185', NULL, 'UY X 128 -LE', '10 J', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-186', 'SNO-068', 'UYX 128 GAS', '10 SLP', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-187', NULL, 'UY X 128-KN', '10', 'GROZ(FFG)', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-188', NULL, 'UY X 128-KN', '10', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-189', 'SNG-047', 'UY X 128', '10', 'GROZ(GEBEDUR)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-190', NULL, 'UY X 128-KK-KN', '10', 'GROZ(FFG)', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-191', 'SNO-086', 'UY X 128-KK-KN', '10', 'ORGAN', 16.6053, 0.135443, true),
  ('GMTS SEWING NEEDLE', 'SN-192', NULL, 'UY X128 SPD', '10', 'ORGAN', 17.5000, 0.142741, true),
  ('GMTS SEWING NEEDLE', 'SN-193', 'SNO-070', 'UY X128 KN HP', '10', 'ORGAN', 17.2510, 0.140710, true),
  ('GMTS SEWING NEEDLE', 'SN-194', 'SNO-102', 'UY X 128 SF', '10', 'ORGAN', 30.0000, 0.244698, true),
  ('GMTS SEWING NEEDLE', 'SN-195', 'SNO-108', 'UY X 128 GAS KN', '10 LP', 'ORGAN', 38.4341, 0.313492, true),
  ('GMTS SEWING NEEDLE', 'SN-196', 'SNG-070', 'UY X 128 SAN 10 XS', '10', 'GROZ(FFG)', 10.3781, 0.084650, true),
  ('GMTS SEWING NEEDLE', 'SN-197', 'SNO-105', 'UY X 128 GAS SF', '10 LP', 'ORGAN', 21.8000, 0.177814, true),
  ('GMTS SEWING NEEDLE', 'SN-200', NULL, 'UY X 128', '11', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-201', 'SNG-049', 'UY X 128', '11', 'GROZ(RG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-202', 'SNG-048', 'UY X 128', '11', 'GROZ(GEBEDUR)', 11.2067, 0.091408, true)
ON CONFLICT (item_code) DO UPDATE SET
  description_item        = EXCLUDED.description_item,
  tac_inventory_item_code = EXCLUDED.tac_inventory_item_code,
  needle_type             = EXCLUDED.needle_type,
  size_dia                = EXCLUDED.size_dia,
  brand                   = EXCLUDED.brand,
  unit_price_bdt          = EXCLUDED.unit_price_bdt,
  unit_price_usd          = EXCLUDED.unit_price_usd,
  active                  = true;

INSERT INTO public.needle_items (
  description_item, item_code, tac_inventory_item_code, needle_type, size_dia, brand, unit_price_bdt, unit_price_usd, active
) VALUES
  ('GMTS SEWING NEEDLE', 'SN-203', 'SNO-073', 'UY X 128', '11', 'ORGAN', 18.2344, 0.148731, true),
  ('GMTS SEWING NEEDLE', 'SN-204', NULL, 'UY X 128', '11 J', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-205', 'SNO-079', 'UY X 128 -LE', '11', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-206', 'SNO-074', 'UY X 128 SPD', '11', 'ORGAN', 25.7429, 0.209975, true),
  ('GMTS SEWING NEEDLE', 'SN-207', NULL, 'UY X 128 KN', '11', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-208', 'SNO-078', 'UY X 128 KN', '11', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-209', 'SNO-076', 'UY X 128 KN', '11 HP', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-210', NULL, 'UY X 128 KN', '11 LP', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-211', NULL, 'UY X 128-KK-KN', '11', 'GROZ(FFG)', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-212', 'SNO-075', 'UY X 128-KK-KN', '11', 'ORGAN', 10.4491, 0.085230, true),
  ('GMTS SEWING NEEDLE', 'SN-213', NULL, 'UY X 128', '11', 'GROZ(GEBEDUR)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-214', NULL, 'UY X 128 KK', '11', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-220', 'SNO-080', 'UY X 128', '12', 'ORGAN', 18.2344, 0.148731, true),
  ('GMTS SEWING NEEDLE', 'SN-221', NULL, 'UY X 128', '12 J', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-222', 'SNO-083', 'UY X 128 NY2 SPD', '12', 'ORGAN', 27.7580, 0.226411, true),
  ('GMTS SEWING NEEDLE', 'SN-223', 'SNO-082', 'UYX 128-KN', '12', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-224', 'SNO-081', 'UY X 128-KN', '12 LP', 'ORGAN', 9.6312, 0.078558, true),
  ('GMTS SEWING NEEDLE', 'SN-225', 'SNG-050', 'UY X 128', '12', 'GROZ(GEBEDUR)', 9.2573, 0.075508, true),
  ('GMTS SEWING NEEDLE', 'SN-228', NULL, 'UY X 128', '14', 'GROZ(FFG)', 9.8000, 0.079935, true),
  ('GMTS SEWING NEEDLE', 'SN-229', 'SNG-052', 'UY X 128', '14', 'GROZ(RG)', 9.8000, 0.079935, true),
  ('GMTS SEWING NEEDLE', 'SN-230', 'SNG-051', 'UY X 128', '14', 'GROZ(GEBEDUR)', 11.0449, 0.090089, true),
  ('GMTS SEWING NEEDLE', 'SN-231', 'SNO-084', 'UY X 128', '14', 'ORGAN', 7.9900, 0.065171, true),
  ('GMTS SEWING NEEDLE', 'SN-232', NULL, 'UY X 128', '14-J', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-236', NULL, 'DP X 5', '7', 'GROZ(FFG)', 7.0000, 0.057096, true),
  ('GMTS SEWING NEEDLE', 'SN-237', 'SNO-022', 'DP X 5', '7', 'ORGAN', 7.0000, 0.057096, true),
  ('GMTS SEWING NEEDLE', 'SN-240', 'SNG-056', 'DP X 5', '8', 'GROZ(FFG)', 4.5900, 0.037439, true),
  ('GMTS SEWING NEEDLE', 'SN-241', NULL, 'DP X 5', '8', 'ORGAN', 5.0000, 0.040783, true),
  ('GMTS SEWING NEEDLE', 'SN-242', 'SNG-057', 'DP X 5 SAN', '8', 'GROZ(FFG)', 6.2000, 0.050571, true),
  ('GMTS SEWING NEEDLE', 'SN-243', NULL, 'DP X 5-KN', '8', 'GROZ(FFG)', 5.0000, 0.040783, true),
  ('GMTS SEWING NEEDLE', 'SN-244', 'SNO-091', 'DP X 5-KN', '8', 'ORGAN', 10.0000, 0.081566, true),
  ('GMTS SEWING NEEDLE', 'SN-245', 'SNO-092', 'DP X 5-KN', '8 LP', 'ORGAN', 7.5000, 0.061175, true),
  ('GMTS SEWING NEEDLE', 'SN-248', 'SNG-023', 'DP X 5', '9', 'GROZ(FFG)', 4.2900, 0.034992, true),
  ('GMTS SEWING NEEDLE', 'SN-249', 'SNG-024', 'DP X 5 SAN 10', '9', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-250', 'SNO-023', 'DP X 5', '9', 'ORGAN', 4.7800, 0.038989, true),
  ('GMTS SEWING NEEDLE', 'SN-251', NULL, 'DP X 5-KN', '9', 'GROZ(FFG)', 7.5000, 0.061175, true),
  ('GMTS SEWING NEEDLE', 'SN-252', 'SNO-093', 'DP X 5-KN', '9 LP', 'ORGAN', 12.4200, 0.101305, true),
  ('GMTS SEWING NEEDLE', 'SN-253', 'SNG-061', 'DP X 5', '9', 'GROZ(GEBEDUR)', 6.2000, 0.050571, true),
  ('GMTS SEWING NEEDLE', 'SN-254', 'SNO-024', 'DP X 5-KN', '9', 'ORGAN', 7.5000, 0.061175, true),
  ('GMTS SEWING NEEDLE', 'SN-255', 'SNG-059', '(DPX5)134 SAN 10XS', '10', 'GROZ(FFG)', 6.1800, 0.050408, true),
  ('GMTS SEWING NEEDLE', 'SN-256', 'SNG-072', '(DPX5)134 SAN 10', '10', 'GROZ(FFG)', 6.2000, 0.050571, true),
  ('GMTS SEWING NEEDLE', 'SN-258', NULL, 'DP X 5', '11', 'GROZ(FFG)', 5.8000, 0.047308, true),
  ('GMTS SEWING NEEDLE', 'SN-259', NULL, 'DP X 5', '11', 'GROZ(GEB)', 5.8000, 0.047308, true),
  ('GMTS SEWING NEEDLE', 'SN-260', NULL, 'DP X 5', '11', 'GROZ(RG)', 5.8000, 0.047308, true),
  ('GMTS SEWING NEEDLE', 'SN-261', 'SNO-025', 'DP X 5', '11', 'ORGAN', 8.1300, 0.066313, true),
  ('GMTS SEWING NEEDLE', 'SN-262', NULL, 'DP X 5-KN', '11', 'GROZ(FFG)', 7.5000, 0.061175, true),
  ('GMTS SEWING NEEDLE', 'SN-263', 'SNO-026', 'DP X 5-KN', '11', 'ORGAN', 7.5000, 0.061175, true),
  ('GMTS SEWING NEEDLE', 'SN-265', 'SNG-079', 'DP X 5', '14', 'GROZ(FFG)', 4.0900, 0.033361, true),
  ('GMTS SEWING NEEDLE', 'SN-266', 'SNO-027', 'DP X 5', '14', 'ORGAN', 7.0000, 0.057096, true),
  ('GMTS SEWING NEEDLE', 'SN-267', 'SNG-035', 'TV X 64', '9', 'GROZ(FFG)', 7.1100, 0.057993, true),
  ('GMTS SEWING NEEDLE', 'SN-268', NULL, 'TV X 64', '9', 'ORGAN', 7.7900, 0.063540, true)
ON CONFLICT (item_code) DO UPDATE SET
  description_item        = EXCLUDED.description_item,
  tac_inventory_item_code = EXCLUDED.tac_inventory_item_code,
  needle_type             = EXCLUDED.needle_type,
  size_dia                = EXCLUDED.size_dia,
  brand                   = EXCLUDED.brand,
  unit_price_bdt          = EXCLUDED.unit_price_bdt,
  unit_price_usd          = EXCLUDED.unit_price_usd,
  active                  = true;

INSERT INTO public.needle_items (
  description_item, item_code, tac_inventory_item_code, needle_type, size_dia, brand, unit_price_bdt, unit_price_usd, active
) VALUES
  ('GMTS SEWING NEEDLE', 'SN-269', 'SNG-036', 'TV X 64', '10', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-270', NULL, 'TV X 64', '10', 'ORGAN', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-271', 'SNG-037', 'TV X 64', '11', 'GROZ(FFG)', 7.2700, 0.059299, true),
  ('GMTS SEWING NEEDLE', 'SN-272', NULL, 'TV X 64', '11', 'ORGAN', 8.7900, 0.071697, true),
  ('GMTS SEWING NEEDLE', 'SN-273', NULL, 'TV X 7', '11', 'GROZ(FFG)', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-274', 'SNO-047', 'TV X 7', '11', 'ORGAN', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-275', NULL, 'TV X 64', '14', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-276', 'SNO-048', 'TV X 64', '14', 'ORGAN', 8.9000, 0.072594, true),
  ('GMTS SEWING NEEDLE', 'SN-277', 'SNG-038', 'UO X 113(UO X 1)', '9', 'GROZ(FFG)', 10.7500, 0.087684, true),
  ('GMTS SEWING NEEDLE', 'SN-278', 'SNO-049', 'UO X 113(UO X 1)', '9', 'ORGAN', 10.4200, 0.084992, true),
  ('GMTS SEWING NEEDLE', 'SN-279', 'SNO-110', 'UO X 113(UO X 1) SPD', '9', 'ORGAN', 22.1000, 0.180261, true),
  ('GMTS SEWING NEEDLE', 'SN-280', 'SNO-112', 'UO X 113(UO X 1)', '9 LP', 'ORGAN', 22.1000, 0.180261, true),
  ('GMTS SEWING NEEDLE', 'SN-283', NULL, 'UO X 113(UO X 1)', '10', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-284', 'SNO-109', 'UO X 113(UO X 1)', '10', 'ORGAN', 16.5900, 0.135318, true),
  ('GMTS SEWING NEEDLE', 'SN-285', 'SNO-113', 'UO X 113(UO X 1)SLP', '10', 'ORGAN', 22.1000, 0.180261, true),
  ('GMTS SEWING NEEDLE', 'SN-287', 'SNG-039', 'UO X 113(UO X 1)', '11', 'GROZ(FFG)', 15.0700, 0.122920, true),
  ('GMTS SEWING NEEDLE', 'SN-288', NULL, 'UO X 113(UO X 1)', '11', 'GROZ(RG)', 15.0700, 0.122920, true),
  ('GMTS SEWING NEEDLE', 'SN-289', 'SNO-050', 'UO X 113(UO X 1)', '11', 'ORGAN', 15.7000, 0.128059, true),
  ('GMTS SEWING NEEDLE', 'SN-290', 'SNO-125', 'UO X 113(UO X 1) GS', '11', 'ORGAN', 26.0000, 0.212072, true),
  ('GMTS SEWING NEEDLE', 'SN-293', NULL, 'UO X 113(UO X 1)', '12', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-294', 'SNO-053', 'UO X 163', '9', 'ORGAN', 10.7000, 0.087276, true),
  ('GMTS SEWING NEEDLE', 'SN-295', 'SNG-042', 'UO X 163', '10', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-296', 'SNO-052', 'UO X 163', '11', 'ORGAN', 10.5600, 0.086134, true),
  ('GMTS SEWING NEEDLE', 'SN-297', 'SNG-043', 'UO X 163', '12', 'GROZ(FFG)', 10.5600, 0.086134, true),
  ('GMTS SEWING NEEDLE', 'SN-298', NULL, 'UO X 113(UO X 1)', '14', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-299', 'SNO-051', 'UO X 113(UO X 1)', '14', 'ORGAN', 21.8600, 0.178303, true),
  ('GMTS SEWING NEEDLE', 'SN-300', 'SNG-029', 'DP X 17', '9', 'GROZ(FFG)', 4.4300, 0.036134, true),
  ('GMTS SEWING NEEDLE', 'SN-301', 'SNO-157', 'DP X 17', '9', 'ORGAN', 7.0000, 0.057096, true),
  ('GMTS SEWING NEEDLE', 'SN-305', 'SNG-030', 'DP X 17', '10', 'GROZ(FFG)', 5.8000, 0.047308, true),
  ('GMTS SEWING NEEDLE', 'SN-306', NULL, 'DP X 17', '11', 'GROZ(FFG)', 5.8000, 0.047308, true),
  ('GMTS SEWING NEEDLE', 'SN-307', NULL, 'DP X 17', '11', 'GROZ(RG)', 5.8000, 0.047308, true),
  ('GMTS SEWING NEEDLE', 'SN-308', 'SNO-028', 'DP X 17', '11', 'ORGAN', 15.0985, 0.123153, true),
  ('GMTS SEWING NEEDLE', 'SN-310', NULL, 'DP X 17 kk(DPxN31)', '11', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-311', NULL, 'DP X 17 kk(DPxN31)', '11', 'ORGAN', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-312', 'SNO-029', 'DP X 17 kk(DPxN31)', '11 J', 'ORGAN', 7.1300, 0.058157, true),
  ('GMTS SEWING NEEDLE', 'SN-313', NULL, 'DP X 17 kk(DPxN31)', '14', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-314', 'SNO-030', 'DP X 17 kk(DPxN31)', '14', 'ORGAN', 7.0600, 0.057586, true),
  ('GMTS SEWING NEEDLE', 'SN-315', NULL, 'DP X 17 kk(DPxN31)', '14 J', 'ORGAN', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-316', NULL, 'DV X 57', '11', 'GROZ(FFG)', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-317', 'SNO-031', 'DV X 57', '11', 'ORGAN', 1.0900, 0.008891, true),
  ('GMTS SEWING NEEDLE', 'SN-318', 'SNO-032', 'DV X 57', '12', 'ORGAN', 29.7325, 0.242516, true),
  ('GMTS SEWING NEEDLE', 'SN-319', 'SNG-031', 'DV X 57', '14', 'GROZ(FFG)', 9.5700, 0.078059, true),
  ('GMTS SEWING NEEDLE', 'SN-320', 'SNO-033', 'DV X 57', '14', 'ORGAN', 17.8300, 0.145432, true),
  ('GMTS SEWING NEEDLE', 'SN-321', NULL, 'DV X 57', '14+', 'ORGAN', 22.4870, 0.183418, true),
  ('GMTS SEWING NEEDLE', 'SN-322', 'SNG-032', 'DV X 57', '16', 'GROZ(FFG)', 11.3000, 0.092170, true),
  ('GMTS SEWING NEEDLE', 'SN-323', 'SNO-034', 'DV X 57', '16', 'ORGAN', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-324', 'SNO-121', 'DV X 57', '10', 'ORGAN', 25.6000, 0.208809, true),
  ('GMTS SEWING NEEDLE', 'SN-328', 'SNO-035', 'FLX 118-GCS', '8', 'ORGAN', 32.9000, 0.268352, true),
  ('GMTS SEWING NEEDLE', 'SN-329', NULL, 'FLX 118-GCS', '9', 'GROZ(FFG)', 30.0000, 0.244698, true),
  ('GMTS SEWING NEEDLE', 'SN-330', 'SNO-036', 'FLX 118-GCS', '9', 'ORGAN', 46.3408, 0.377984, true)
ON CONFLICT (item_code) DO UPDATE SET
  description_item        = EXCLUDED.description_item,
  tac_inventory_item_code = EXCLUDED.tac_inventory_item_code,
  needle_type             = EXCLUDED.needle_type,
  size_dia                = EXCLUDED.size_dia,
  brand                   = EXCLUDED.brand,
  unit_price_bdt          = EXCLUDED.unit_price_bdt,
  unit_price_usd          = EXCLUDED.unit_price_usd,
  active                  = true;

INSERT INTO public.needle_items (
  description_item, item_code, tac_inventory_item_code, needle_type, size_dia, brand, unit_price_bdt, unit_price_usd, active
) VALUES
  ('GMTS SEWING NEEDLE', 'SN-331', NULL, 'FLX 118-GCS', '10', 'GROZ(FFG)', 33.9150, 0.276631, true),
  ('GMTS SEWING NEEDLE', 'SN-332', NULL, 'FLX 118-GCS', '10', 'ORGAN', 33.9150, 0.276631, true),
  ('GMTS SEWING NEEDLE', 'SN-333', NULL, 'FLX 118-GCS', '11', 'GROZ(FFG)', 30.0000, 0.244698, true),
  ('GMTS SEWING NEEDLE', 'SN-334', 'SNO-037', 'FLX 118-GCS', '11', 'ORGAN', 48.9262, 0.399072, true),
  ('GMTS SEWING NEEDLE', 'SN-335', 'SNO-038', 'FLX 118-GCS', '12', 'ORGAN', 35.0000, 0.285481, true),
  ('GMTS SEWING NEEDLE', 'SN-336', 'SNO-114', 'FLX 118-GCS NY2', '9', 'ORGAN', 33.7539, 0.275317, true),
  ('GMTS SEWING NEEDLE', 'SN-337', 'SNO-115', 'FLX 118-GCS NY2', '10', 'ORGAN', 33.4027, 0.272452, true),
  ('GMTS SEWING NEEDLE', 'SN-338', 'SNO-116', 'FLX 118-GCS NY2', '9', 'ORGAN', 37.5728, 0.306467, true),
  ('GMTS SEWING NEEDLE', 'SN-339', 'SNO-117', 'FLX 118-GCS NY2', '10', 'ORGAN', 36.8713, 0.300745, true),
  ('GMTS SEWING NEEDLE', 'SN-340', 'SNG-021', 'DM X 13', '9', 'GROZ(FFG)', 7.5000, 0.061175, true),
  ('GMTS SEWING NEEDLE', 'SN-341', NULL, 'DM X 13', '9', 'ORGAN', 7.5000, 0.061175, true),
  ('GMTS SEWING NEEDLE', 'SN-343', 'SNG-022', 'DM X 13', '10', 'GROZ(FFG)', 7.5000, 0.061175, true),
  ('GMTS SEWING NEEDLE', 'SN-344', NULL, 'DM X 13', '10', 'ORGAN', 7.5000, 0.061175, true),
  ('GMTS SEWING NEEDLE', 'SN-346', NULL, 'LW X 6 T', '65/9', 'GROZ(FFG)', 3.8000, 0.030995, true),
  ('GMTS SEWING NEEDLE', 'SN-348', NULL, 'LW X 6 T', '75/11', 'GROZ(FFG)', 3.8000, 0.030995, true),
  ('GMTS SEWING NEEDLE', 'SN-350', NULL, 'LW X 6 T/251 EU', '12', 'GROZ(FFG)', 3.8000, 0.030995, true),
  ('GMTS SEWING NEEDLE', 'SN-351', 'SNG-077', 'LW X 6 T/1669 E', '14', 'GROZ(FFG)', 33.5500, 0.273654, true),
  ('GMTS SEWING NEEDLE', 'SN-352', 'SNG-078', 'LW X 6 T/1669 E', '16', 'GROZ(FFG)', 33.5500, 0.273654, true),
  ('GMTS SEWING NEEDLE', 'SN-355', 'SNG-033', 'PF X 134 KK', '12', 'GROZ(FFG)', 5.6000, 0.045677, true),
  ('GMTS SEWING NEEDLE', 'SN-356', NULL, 'MM X 75', '118', 'ORGAN', 7.0000, 0.057096, true),
  ('GMTS SEWING NEEDLE', 'SN-357', 'SNO-128', 'FTD -61', '40CSM', 'ORGAN', 5.6000, 0.045677, true),
  ('GMTS SEWING NEEDLE', 'SN-360', NULL, 'SM X 1014 B', '10', 'GROZ(FFG)', 33.0000, 0.269168, true),
  ('GMTS SEWING NEEDLE', 'SN-361', 'SNO-042', 'SM X 1014 B', '10', 'ORGAN', 35.0000, 0.285481, true),
  ('GMTS SEWING NEEDLE', 'SN-400', 'SNG-005', 'DB X K5-KK NO-09 GROZ', '9', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-401', 'SNG-017', 'DCX1SAN,NO-10,GROZ', '10', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-402', 'SNG-023', 'DP X 5-FFG,NO-09,GROZ', '9', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-403', 'SNG-024', 'DP X 5-SAN 10,NO-09,GROZ', '9', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-404', 'SNG-025', 'DP X 5-FFG,NO-11,GROZ', '11', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-405', 'SNG-030', 'DP X 17-FFG,NO-10,GROZ', '10', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-406', 'SNG-032', 'DV X 57-FFG,NO-16,GROZ', '16', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-407', 'SNG-033', 'PF X 134 KK-FFG,NO-12,GROZ', '12', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-408', 'SNG-034', 'TV X 07-FFG,NO-11,GROZ', '11', 'GROZ', 8.6000, 0.070147, true),
  ('GMTS SEWING NEEDLE', 'SN-409', 'SNG-036', 'TV X 64-FFG,NO-10,GROZ', '10', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-410', 'SNG-042', 'UO/UY X 163-FFG,NO-10,GROZ', '10', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-411', 'SNG-043', 'UO/UY X 163-FFG,NO-12,GROZ', '12', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-412', 'SNG-044', 'UY X 128-SAN,NO-07,GROZ', '7', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-413', 'SNG-047', 'UY X 128-GEBEDUR-FFG,NO-10,GROZ', '10', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-414', 'SNG-048', 'UY X 128-GEBEDUR,NO-11,GROZ', '11', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-415', 'SNG-049', 'UY X 128-RG,NO-11,GROZ', '11', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-416', 'SNG-052', 'UY X 128-RG,NO-14,GROZ', '14', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-417', 'SNG-053', 'DB X 1-SAN 10-XS-FFG AI,NO-08,GROZ', '8', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-418', 'SNG-054', 'DB X 1-GEBEDURE-FFG ,NO-08,GROZ', '8', 'GROZ', 6.2000, 0.050571, true),
  ('GMTS SEWING NEEDLE', 'SN-419', 'SNG-055', 'DB X 1-SAN 10-XS-FFG AI,NO-09,GROZ', '9', 'GROZ', 4.3000, 0.035073, true),
  ('GMTS SEWING NEEDLE', 'SN-420', 'SNG-056', 'DP X 5-FFG,NO-08,GROZ', '8', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-421', 'SNG-057', 'DP X 5-SAN 10-FFG,NO-08,GROZ', '8', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-422', 'SNG-058', 'DP X 5-134SAN 10XS-FFG AI,NO-09,GROZ', '9', 'GROZ', 6.2000, 0.050571, true),
  ('GMTS SEWING NEEDLE', 'SN-423', 'SNG-059', 'DP X 5-134SAN 10XS-FFG AI,NO-10,GROZ', '10', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-424', 'SNG-060', 'DP X 5-GEBEDURE-FFG,NO-08,GROZ', '8', 'GROZ', 6.2000, 0.050571, true),
  ('GMTS SEWING NEEDLE', 'SN-425', 'SNG-061', 'DP X 5-GEBEDURE-FFG,NO-09,GROZ', '9', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-426', 'SNG-064', 'DCX27-GEBEDURE-FFG,NO-08,GROZ', '8', 'GROZ', 10.4000, 0.084829, true)
ON CONFLICT (item_code) DO UPDATE SET
  description_item        = EXCLUDED.description_item,
  tac_inventory_item_code = EXCLUDED.tac_inventory_item_code,
  needle_type             = EXCLUDED.needle_type,
  size_dia                = EXCLUDED.size_dia,
  brand                   = EXCLUDED.brand,
  unit_price_bdt          = EXCLUDED.unit_price_bdt,
  unit_price_usd          = EXCLUDED.unit_price_usd,
  active                  = true;

INSERT INTO public.needle_items (
  description_item, item_code, tac_inventory_item_code, needle_type, size_dia, brand, unit_price_bdt, unit_price_usd, active
) VALUES
  ('GMTS SEWING NEEDLE', 'SN-427', 'SNG-067', 'UY X128-SAN 10-FFG,NO-08,GROZ', '8', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-428', 'SNG-068', 'UY X128-SAN 10-FFG,NO-10,GROZ', '10', 'GROZ', 6.2000, 0.050571, true),
  ('GMTS SEWING NEEDLE', 'SN-429', 'SNG-069', 'UY X128-SAN 10-XS-FFG AI,NO-09,GROZ', '9', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-430', 'SNG-070', 'UY X128-SAN 10-XS-FFG AI,NO-10,GROZ', '10', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-431', 'SNG-072', 'DP X 5-SAN 10,NO-10,GROZ', '10', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-432', 'SNG-079', 'DP X 5-FFG,NO-14,GROZ', '14', 'GROZ', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-433', 'SNO-001', 'DB X 1 SPD,NO-07,ORGAN', '7', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-434', 'SNO-005', 'DB X K5KK,NO-08,ORGAN', '8', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-435', 'SNO-008', 'DB X 1 KN,NO-09,ORGAN', '9', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-436', 'SNO-020', 'DC X 1 KN,NO-11,ORGAN', '11', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-437', 'SNO-024', 'DP X 5 KN,NO-09,ORGAN', '9', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-438', 'SNO-027', 'DP X 5,NO-14,ORGAN', '14', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-439', 'SNO-029', 'DP X 17 KK,NO-11 J,ORGAN', '11', 'ORGAN', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-440', 'SNO-030', 'DP X 17 KK,NO-14 S,ORGAN', '14', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-441', 'SNO-034', 'DV X 57,NO-16,ORGAN', '16', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-442', 'SNO-035', 'FL X 118-GCS,NO-08,ORGAN', '8', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-443', 'SNO-038', 'FL X 118-GCS,NO-12,ORGAN', '12', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-444', 'SNO-039', 'MM X 75,NO-118,ORGAN', '118', 'ORGAN', 7.0000, 0.057096, true),
  ('GMTS SEWING NEEDLE', 'SN-445', 'SNO-042', 'SM X 1014B,NO-10,ORGAN', '10', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-446', 'SNO-043', 'TQ X 1,NO-09,ORGAN', '9', 'ORGAN', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-447', 'SNO-044', 'TQ X 1,NO-11,ORGAN', '11', 'ORGAN', 7.3000, 0.059543, true),
  ('GMTS SEWING NEEDLE', 'SN-448', 'SNO-045', 'TQ X 1,NO-14,ORGAN', '14', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-449', 'SNO-046', 'TQ X 1,NO-16,ORGAN', '16', 'ORGAN', 11.4190, 0.093140, true),
  ('GMTS SEWING NEEDLE', 'SN-450', 'SNO-047', 'TV X 7,NO-11,ORGAN', '11', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-451', 'SNO-048', 'TV X 64,NO-14,ORGAN', '14', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-452', 'SNO-053', 'UO X 163,NO-09,ORGAN', '9', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-453', 'SNO-055', 'UY X 128 KKKN,NO-07,ORGAN', '7', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-454', 'SNO-057', 'UY X 128 SPD,NO-08,ORGAN', '8', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-455', 'SNO-060', 'UY X 128 KN,NO-08,ORGAN', '8', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-456', 'SNO-065', 'UY X 128 LE,NO-09 J,ORGAN', '9', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-457', 'SNO-070', 'UY X 128 KN,NO-10 HP,ORGAN', '10', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-458', 'SNO-078', 'UY X 128 KN,NO-11,ORGAN', '11', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-459', 'SNO-079', 'UY X 128 LE,NO-11,ORGAN', '11', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-460', 'SNO-085', 'DP X 5,NO-20,ORGAN', '20', 'ORGAN', 6.3000, 0.051387, true),
  ('GMTS SEWING NEEDLE', 'SN-461', 'SNO-088', 'DB X 1 KN,NO-08,ORGAN', '8', 'ORGAN', 17.5000, 0.142741, true),
  ('GMTS SEWING NEEDLE', 'SN-462', 'SNO-091', 'DP X 5, KN,NO-08,ORGAN', '8', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-463', 'SNO-092', 'DP X 5, KN-LP,NO-08,ORGAN', '8', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-464', 'SNO-096', 'DC X 27 KN-PD,NO-09,ORGAN', '9', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-465', 'SNO-106', 'UY X 128 LE-SPD,NO-09,ORGAN', '9', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-466', 'SNO-110', 'UO X 113GS S-PD,NO-09,ORGAN', '9', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-467', 'SNO-111', 'UO X 113GS S-PD,NO-10,ORGAN', '10', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-468', 'SNO-112', 'UO X 113GS S-LP,NO-09,ORGAN', '9', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-469', 'SNO-118', 'DBX1 12 B/S/J ,ORGAN', '', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-470', 'SNO-123', 'DB X 1,KN-LP,NO-11 ORGAN', '11', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-471', 'SNO-124', 'FL X 118,GCS-SK-S/B BALL,NO-10,ORGAN', '10', 'ORGAN', 39.9000, 0.325449, true),
  ('GMTS SEWING NEEDLE', 'SN-472', 'SNO-125', 'UO X113,GS-NY2/+SLP,NO-11,ORGAN', '11', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-473', 'SNO-126', 'DV X57,LE-NY2 SLP,NO-14,ORGAN', '14', 'ORGAN', 30.0000, 0.244698, true),
  ('GMTS SEWING NEEDLE', 'SN-474', 'SNO-128', 'FTD-61,40CSM', '', 'ORGAN', 0.0000, 0.000000, true),
  ('GMTS SEWING NEEDLE', 'SN-475', 'SNO-188', 'DB X 1 NS,NO-LP', '8', 'ORGAN', 16.8000, 0.137031, true),
  ('GMTS SEWING NEEDLE', 'SN-476', 'SNO-189', 'DP X 5 NS', '8', 'ORGAN', 14.5000, 0.118271, true)
ON CONFLICT (item_code) DO UPDATE SET
  description_item        = EXCLUDED.description_item,
  tac_inventory_item_code = EXCLUDED.tac_inventory_item_code,
  needle_type             = EXCLUDED.needle_type,
  size_dia                = EXCLUDED.size_dia,
  brand                   = EXCLUDED.brand,
  unit_price_bdt          = EXCLUDED.unit_price_bdt,
  unit_price_usd          = EXCLUDED.unit_price_usd,
  active                  = true;

INSERT INTO public.needle_items (
  description_item, item_code, tac_inventory_item_code, needle_type, size_dia, brand, unit_price_bdt, unit_price_usd, active
) VALUES
  ('GMTS SEWING NEEDLE', 'SN-477', 'SNO-190', 'DP X 5 NS', '9', 'ORGAN', 14.5000, 0.118271, true),
  ('GMTS SEWING NEEDLE', 'SN-478', 'SNO-191', 'DC X 1 NS', '8', 'ORGAN', 23.5000, 0.191680, true),
  ('GMTS SEWING NEEDLE', 'SN-479', 'SNO-193', 'DV X 43', '14', 'ORGAN', 16.6100, 0.135481, true),
  ('GMTS SEWING NEEDLE', 'SN-480', 'SNG-100', 'LWX1669E', '14', 'GROZ', 60.8000, 0.495922, true),
  ('GMTS SEWING NEEDLE', 'SN-481', 'SNG-101', 'LWX1669E', '12', 'GROZ', 60.8000, 0.495922, true),
  ('GMTS SEWING NEEDLE', 'SN-482', 'SNO-245', 'DV X 43', '12', 'ORGAN', 17.5000, 0.142741, true),
  ('GMTS SEWING NEEDLE', 'SN-483', 'SNO-246', 'DP X 17 SK,SPD', '14', 'ORGAN', 27.0000, 0.220228, true),
  ('GMTS SEWING NEEDLE', 'SN-484', 'SNO-134', 'DB X 1 SPD', '12', 'ORGAN', 18.0000, 0.146819, true)
ON CONFLICT (item_code) DO UPDATE SET
  description_item        = EXCLUDED.description_item,
  tac_inventory_item_code = EXCLUDED.tac_inventory_item_code,
  needle_type             = EXCLUDED.needle_type,
  size_dia                = EXCLUDED.size_dia,
  brand                   = EXCLUDED.brand,
  unit_price_bdt          = EXCLUDED.unit_price_bdt,
  unit_price_usd          = EXCLUDED.unit_price_usd,
  active                  = true;

-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 5. Seed Initial Floor Assignments (Assign to ALL Floors)
-- Connect all master needles with ALL active factory floors
-- ---------------------------------------------------------------------------
INSERT INTO public.needle_floor_assignments (needle_item_id, floor_id, needle_group)
SELECT n.id, f.id, 'needle'
FROM public.needle_items n
CROSS JOIN public.floors f
WHERE f.active = true
ON CONFLICT (needle_item_id, floor_id, needle_group) DO NOTHING;

-- Only IN codes belong to Ideal Needle, across all active floors.
INSERT INTO public.needle_floor_assignments (needle_item_id, floor_id, needle_group)
SELECT n.id, f.id, 'ideal_needle'
FROM public.needle_items n
CROSS JOIN public.floors f
WHERE f.active = true AND upper(btrim(n.item_code)) LIKE 'IN%'
ON CONFLICT (needle_item_id, floor_id, needle_group) DO NOTHING;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Migration: 20261022000000_needle_master_select_all_floors.sql
-- Select every active floor shown in Needle Master for all existing items.
-- Run after 20241001000008_needle_master.sql.
-- This is a one-time backfill for the 'needle' group; future items and floors
-- continue to use the application's normal assignment workflow.
-- Existing assignments are preserved, making this migration safe to rerun.

INSERT INTO public.needle_floor_assignments (
  needle_item_id,
  floor_id,
  needle_group
)
SELECT n.id, f.id, 'needle'
FROM public.needle_items AS n
CROSS JOIN public.floors AS f
WHERE f.active = true
ON CONFLICT (needle_item_id, floor_id, needle_group) DO NOTHING;

-- Optional verification after running: this should return 0.
-- SELECT count(*) AS missing_assignments
-- FROM public.needle_items AS n
-- CROSS JOIN public.floors AS f
-- WHERE f.active = true
--   AND NOT EXISTS (
--     SELECT 1
--     FROM public.needle_floor_assignments AS a
--     WHERE a.needle_item_id = n.id
--       AND a.floor_id = f.id
--       AND a.needle_group = 'needle'
--   );

-- =============================================================================
-- Migration: 20261023000000_idle_needle_master.sql
-- Source: Excel/IdleNeedleUnitPrice.xlsx, 'UNIT PRICE'!A2:G42 (41 items).
-- Run after 20241001000008_needle_master.sql on an existing ERP database.
-- Imports IN-001 through IN-041 and selects every currently active floor.
-- The existing application calls the idle needle group 'ideal_needle'.
-- Prices use the workbook's BDT and USD values, rounded to the database scales
-- (4 and 6 decimals respectively). The workbook's USD conversion is BDT / 110.
-- Safe to rerun: updates these items and adds missing idle floor assignments.
-- Preserves other items, TAC codes, and all existing floor/group assignments.
-- Future floors can be selected by rerunning this import or through the app.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.needle_items') IS NULL
     OR to_regclass('public.needle_floor_assignments') IS NULL
     OR to_regclass('public.floors') IS NULL THEN
    RAISE EXCEPTION 'Run the ERP schema and 20241001000008_needle_master.sql first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.floors WHERE active = true) THEN
    RAISE EXCEPTION 'Create or enable at least one floor before importing idle needles.';
  END IF;
END;
$$;

WITH imported AS (
  INSERT INTO public.needle_items (
    description_item, item_code, needle_type, size_dia, brand,
    unit_price_bdt, unit_price_usd, active
  ) VALUES
    ('GMTS SEWING NEEDLE', 'IN-001', 'DB X 1', '7', 'ORGAN', 7.5000, 0.068182, true),
    ('GMTS SEWING NEEDLE', 'IN-002', 'DB X 1', '8', 'ORGAN', 4.3000, 0.039091, true),
    ('GMTS SEWING NEEDLE', 'IN-003', 'DB X 1', '9', 'ORGAN', 5.8000, 0.052727, true),
    ('GMTS SEWING NEEDLE', 'IN-004', 'DB X 1', '10', 'ORGAN', 9.6800, 0.088000, true),
    ('GMTS SEWING NEEDLE', 'IN-005', 'DB X 1', '11', 'ORGAN', 4.3000, 0.039091, true),
    ('GMTS SEWING NEEDLE', 'IN-006', 'DB X 1', '12', 'ORGAN', 4.3000, 0.039091, true),
    ('GMTS SEWING NEEDLE', 'IN-007', 'DB X 1', '14', 'ORGAN', 4.3000, 0.039091, true),
    ('GMTS SEWING NEEDLE', 'IN-008', 'DC X 1', '7', 'ORGAN', 7.3000, 0.066364, true),
    ('GMTS SEWING NEEDLE', 'IN-009', 'DC X 1', '8', 'ORGAN', 7.3000, 0.066364, true),
    ('GMTS SEWING NEEDLE', 'IN-010', 'DC X 1', '9', 'ORGAN', 9.6800, 0.088000, true),
    ('GMTS SEWING NEEDLE', 'IN-011', 'DC X 1', '10', 'ORGAN', 7.3000, 0.066364, true),
    ('GMTS SEWING NEEDLE', 'IN-012', 'DC X 1', '11', 'ORGAN', 7.3000, 0.066364, true),
    ('GMTS SEWING NEEDLE', 'IN-013', 'DC X 1', '12', 'ORGAN', 7.3000, 0.066364, true),
    ('GMTS SEWING NEEDLE', 'IN-014', 'DC X 1', '14', 'ORGAN', 10.5400, 0.095818, true),
    ('GMTS SEWING NEEDLE', 'IN-015', 'UY X 128', '7', 'ORGAN', 1.7600, 0.016000, true),
    ('GMTS SEWING NEEDLE', 'IN-016', 'UY X 128', '8', 'ORGAN', 1.7600, 0.016000, true),
    ('GMTS SEWING NEEDLE', 'IN-017', 'UY X 128', '9', 'ORGAN', 11.3000, 0.102727, true),
    ('GMTS SEWING NEEDLE', 'IN-018', 'UY X 128', '9 LP', 'ORGAN', 2.8600, 0.026000, true),
    ('GMTS SEWING NEEDLE', 'IN-019', 'UY X 128 SPD', '9', 'ORGAN', 17.5000, 0.159091, true),
    ('GMTS SEWING NEEDLE', 'IN-020', 'UY X 128', '10', 'ORGAN', 11.3000, 0.102727, true),
    ('GMTS SEWING NEEDLE', 'IN-021', 'UY X 128', '11', 'ORGAN', 11.3000, 0.102727, true),
    ('GMTS SEWING NEEDLE', 'IN-022', 'UY X 128', '12', 'ORGAN', 2.3100, 0.021000, true),
    ('GMTS SEWING NEEDLE', 'IN-023', 'UY X 128', '14', 'ORGAN', 9.8000, 0.089091, true),
    ('GMTS SEWING NEEDLE', 'IN-024', 'DP X 5', '9', 'ORGAN', 4.3000, 0.039091, true),
    ('GMTS SEWING NEEDLE', 'IN-025', 'DP X 5', '11', 'ORGAN', 5.8000, 0.052727, true),
    ('GMTS SEWING NEEDLE', 'IN-026', 'DP X 5', '14', 'ORGAN', 4.3000, 0.039091, true),
    ('GMTS SEWING NEEDLE', 'IN-027', 'TV X 64', '9', 'ORGAN', 7.3000, 0.066364, true),
    ('GMTS SEWING NEEDLE', 'IN-028', 'TV X 64', '11', 'ORGAN', 7.3000, 0.066364, true),
    ('GMTS SEWING NEEDLE', 'IN-029', 'TV X 64', '14', 'ORGAN', 8.9000, 0.080909, true),
    ('GMTS SEWING NEEDLE', 'IN-030', 'UY X 113(UO X 1)', '9', 'ORGAN', 11.3000, 0.102727, true),
    ('GMTS SEWING NEEDLE', 'IN-031', 'UY X 113(UO X 1)', '11', 'ORGAN', 15.0700, 0.137000, true),
    ('GMTS SEWING NEEDLE', 'IN-032', 'UY X 113(UO X 1)', '14', 'ORGAN', 10.7000, 0.097273, true),
    ('GMTS SEWING NEEDLE', 'IN-033', 'DP X 17', '9', 'ORGAN', 5.8000, 0.052727, true),
    ('GMTS SEWING NEEDLE', 'IN-034', 'DP X 17', '11', 'ORGAN', 5.8000, 0.052727, true),
    ('GMTS SEWING NEEDLE', 'IN-035', 'DP X 17', '14', 'ORGAN', 7.3000, 0.066364, true),
    ('GMTS SEWING NEEDLE', 'IN-036', 'DV X 57', '11', 'ORGAN', 7.3000, 0.066364, true),
    ('GMTS SEWING NEEDLE', 'IN-037', 'DV X 57', '14', 'ORGAN', 11.3000, 0.102727, true),
    ('GMTS SEWING NEEDLE', 'IN-038', 'FLX 118-GCS', '9', 'ORGAN', 35.0000, 0.318182, true),
    ('GMTS SEWING NEEDLE', 'IN-039', 'FLX 118-GCS', '11', 'ORGAN', 25.0480, 0.227709, true),
    ('GMTS SEWING NEEDLE', 'IN-040', 'SM X 1014', '10', 'ORGAN', 33.0000, 0.300000, true),
    ('GMTS SEWING NEEDLE', 'IN-041', 'LW X 1669E', '12', 'ORGAN', 33.5500, 0.305000, true)
  ON CONFLICT (item_code) DO UPDATE SET
    description_item = EXCLUDED.description_item,
    needle_type = EXCLUDED.needle_type,
    size_dia = EXCLUDED.size_dia,
    brand = EXCLUDED.brand,
    unit_price_bdt = EXCLUDED.unit_price_bdt,
    unit_price_usd = EXCLUDED.unit_price_usd,
    active = true
  RETURNING id
), assigned AS (
  INSERT INTO public.needle_floor_assignments (
    needle_item_id, floor_id, needle_group
  )
  SELECT i.id, f.id, 'ideal_needle'
  FROM imported AS i
  CROSS JOIN public.floors AS f
  WHERE f.active = true
  ON CONFLICT (needle_item_id, floor_id, needle_group) DO NOTHING
  RETURNING needle_item_id
)
SELECT
  (SELECT count(*) FROM imported) AS imported_idle_needles,
  (SELECT count(*) FROM public.floors WHERE active = true) AS selected_active_floors,
  (SELECT count(*) FROM assigned) AS added_floor_assignments;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Migration: 20261023000001_ideal_needle_in_codes_only.sql
-- Ideal/Idle Needle item codes start with IN.
-- Run after the Needle Master and Idle Needle import migrations.
-- Remove only incorrect Ideal Needle floor links. Keep every master item,
-- regular Needle assignment, and IN floor selection unchanged. Safe to rerun.

BEGIN;

DELETE FROM public.needle_floor_assignments AS assignment
USING public.needle_items AS item
WHERE assignment.needle_item_id = item.id
  AND assignment.needle_group = 'ideal_needle'
  AND upper(btrim(item.item_code)) NOT LIKE 'IN%';

COMMIT;

-- Migration: 20261023000002_reset_separate_needle_catalogs.sql
-- Explicit reset requested by the owner: remove existing needle catalogs and
-- assignments, then rebuild separate normal and idle catalogs from Excel.
-- RUN ONCE on the existing ERP database after the foundational migrations.
-- Rerunning intentionally resets all needle data again, including manual edits.
-- Users, roles, floors, floor locations, and audit logs are not deleted.
-- All active floors are selected for each imported needle at seed time.
-- 59 normal prices and 2 sizes are missing in the source and remain NULL.
-- No CASCADE on DROP: unexpected dependencies abort instead of being removed.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.floors') IS NULL THEN
    RAISE EXCEPTION 'Run the ERP foundational migrations first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.floors WHERE active = true) THEN
    RAISE EXCEPTION 'Create or enable floors before resetting needle catalogs.';
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.needle_floor_assignments;
DROP TABLE IF EXISTS public.needle_items;
DROP TABLE IF EXISTS public.normal_needle_floor_assignments;
DROP TABLE IF EXISTS public.idle_needle_floor_assignments;
DROP TABLE IF EXISTS public.normal_needle_items;
DROP TABLE IF EXISTS public.idle_needle_items;

INSERT INTO public.permissions (key, module, page, action, label, description)
VALUES
  ('needle_management.needle.view',         'needle_management', 'needle',       'view',   'Needle Master - View',         'View needle master items and floor assignments'),
  ('needle_management.needle.create',       'needle_management', 'needle',       'create', 'Needle Master - Create',       'Create new needle master items and floor assignments'),
  ('needle_management.needle.edit',         'needle_management', 'needle',       'edit',   'Needle Master - Edit',         'Update needle master properties and floor assignments'),
  ('needle_management.needle.delete',       'needle_management', 'needle',       'delete', 'Needle Master - Delete',       'Delete or deactivate needle items'),
  ('needle_management.ideal_needle.view',   'needle_management', 'ideal_needle', 'view',   'Ideal Needle Master - View',   'View ideal needle master items and floor assignments'),
  ('needle_management.ideal_needle.create', 'needle_management', 'ideal_needle', 'create', 'Ideal Needle Master - Create', 'Create ideal needle master items and floor assignments'),
  ('needle_management.ideal_needle.edit',   'needle_management', 'ideal_needle', 'edit',   'Ideal Needle Master - Edit',   'Update ideal needle properties and floor assignments'),
  ('needle_management.ideal_needle.delete', 'needle_management', 'ideal_needle', 'delete', 'Ideal Needle Master - Delete', 'Delete or deactivate ideal needle items')
ON CONFLICT (key) DO NOTHING;

-- Grant to Site Admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Site Admin'
  AND p.key LIKE 'needle_management.%'
ON CONFLICT DO NOTHING;

-- 358 normal items from Excel/unitPrice.xlsx, UNIT PRICE.
CREATE TABLE public.normal_needle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description_item TEXT NOT NULL,
  item_code TEXT NOT NULL UNIQUE CHECK (item_code = upper(btrim(item_code)) AND item_code LIKE 'SN%'),
  tac_inventory_item_code TEXT,
  needle_type TEXT NOT NULL,
  size_dia TEXT,
  brand TEXT NOT NULL,
  unit_price_bdt NUMERIC(18,6) CHECK (unit_price_bdt >= 0),
  unit_price_usd NUMERIC(18,8) CHECK (unit_price_usd >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_normal_needle_items_brand ON public.normal_needle_items(brand);
CREATE INDEX idx_normal_needle_items_type ON public.normal_needle_items(needle_type);
CREATE TRIGGER trg_normal_needle_items_updated_at BEFORE UPDATE ON public.normal_needle_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.normal_needle_floor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  needle_item_id UUID NOT NULL REFERENCES public.normal_needle_items(id) ON DELETE CASCADE,
  floor_id UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (needle_item_id, floor_id)
);
CREATE INDEX idx_normal_needle_floor_assignments_floor ON public.normal_needle_floor_assignments(floor_id);
CREATE TRIGGER trg_normal_needle_floor_assignments_updated_at BEFORE UPDATE ON public.normal_needle_floor_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.normal_needle_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normal_needle_floor_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON public.normal_needle_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read ON public.normal_needle_items FOR SELECT TO authenticated USING (true);
CREATE POLICY service_role_all ON public.normal_needle_floor_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read ON public.normal_needle_floor_assignments FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.normal_needle_items, public.normal_needle_floor_assignments TO authenticated;
GRANT ALL ON public.normal_needle_items, public.normal_needle_floor_assignments TO service_role;

-- One transaction for replacing an item's selections, including an empty set.
-- A wrong-catalog item ID or invalid floor fails before any changes commit.
CREATE OR REPLACE FUNCTION public.set_normal_needle_floors(p_item_id UUID, p_floor_ids UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1 FROM public.normal_needle_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Needle does not exist in the normal catalog.';
  END IF;
  DELETE FROM public.normal_needle_floor_assignments WHERE needle_item_id = p_item_id;
  INSERT INTO public.normal_needle_floor_assignments(needle_item_id, floor_id)
  SELECT p_item_id, floor_id FROM (SELECT DISTINCT unnest(coalesce(p_floor_ids, '{}'::UUID[])) AS floor_id) AS chosen;
END;
$$;
REVOKE ALL ON FUNCTION public.set_normal_needle_floors(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_normal_needle_floors(UUID, UUID[]) TO service_role;

INSERT INTO public.normal_needle_items (
  description_item, item_code, tac_inventory_item_code, needle_type, size_dia,
  brand, unit_price_bdt, unit_price_usd, active
) VALUES
  ('GMTS SEWING NEEDLE', 'SN-001', 'SNG-001', 'DB X 1', '7', 'GROZ(FFG)', 6.337680, 0.05169396, true),
  ('GMTS SEWING NEEDLE', 'SN-002', NULL, 'DB X 1', '7', 'GROZ(RG)', 6.337680, 0.05169396, true),
  ('GMTS SEWING NEEDLE', 'SN-003', 'SNO-002', 'DB X 1', '7', 'ORGAN', 4.981340, 0.04063083, true),
  ('GMTS SEWING NEEDLE', 'SN-004', 'SNO-001', 'DB X 1 SPD/SPD+', '7', 'ORGAN', 10.153000, 0.08281403, true),
  ('GMTS SEWING NEEDLE', 'SN-005', NULL, 'DB X 1 KN PD', '7', 'ORGAN', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-006', 'SNG-002', 'DB X 1 SAN 10', '7', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-011', NULL, 'DB X 1', '8', 'GROZ(FFG)', 4.300000, 0.03507341, true),
  ('GMTS SEWING NEEDLE', 'SN-012', NULL, 'DB X 1 SAN 10', '8', 'GROZ(FFG)', 6.200000, 0.05057096, true),
  ('GMTS SEWING NEEDLE', 'SN-013', 'SNO-004', 'DB X 1', '8', 'ORGAN', 8.129970, 0.06631297, true),
  ('GMTS SEWING NEEDLE', 'SN-014', 'SNO-003', 'DB X 1 SF', '8', 'ORGAN', 7.481230, 0.06102145, true),
  ('GMTS SEWING NEEDLE', 'SN-015', 'SNO-005', 'DB X K 5 KN', '8', 'ORGAN', 5.300000, 0.04323002, true),
  ('GMTS SEWING NEEDLE', 'SN-016', 'SNO-181', 'DB X 1 SPD/SPD+', '8', 'ORGAN', 11.000000, 0.08972268, true),
  ('GMTS SEWING NEEDLE', 'SN-017', NULL, 'DB X 1 KN PD', '8', 'ORGAN', 10.300000, 0.08401305, true),
  ('GMTS SEWING NEEDLE', 'SN-018', 'SNG-053', 'DB X 1 SAN 10 XS', '8', 'GROZ(FFG)', 6.200000, 0.05057096, true),
  ('GMTS SEWING NEEDLE', 'SN-019', 'SNO-089', 'DB X 1 KN', '8 LP', 'ORGAN', 12.500000, 0.10195759, true),
  ('GMTS SEWING NEEDLE', 'SN-020', NULL, 'DB X 1 K5 NY', '8', 'ORGAN', 5.300000, 0.04323002, true),
  ('GMTS SEWING NEEDLE', 'SN-025', NULL, 'DB X 1', '9', 'GROZ(FFG)', 5.800000, 0.04730832, true),
  ('GMTS SEWING NEEDLE', 'SN-026', NULL, 'DB X 1', '9', 'GROZ(RG)', 5.800000, 0.04730832, true),
  ('GMTS SEWING NEEDLE', 'SN-027', NULL, 'DB X 1 SAN 10', '9', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-028', NULL, 'DB X K5', '9', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-029', 'SNO-007', 'DB X 1', '9', 'ORGAN', 8.190980, 0.06681060, true),
  ('GMTS SEWING NEEDLE', 'SN-030', NULL, 'DB X 1-KN', '9', 'GROZ(FFG)', 4.300000, 0.03507341, true),
  ('GMTS SEWING NEEDLE', 'SN-031', 'SNO-008', 'DB X 1-KN', '9', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-032', 'SNO-006', 'DB X 1-SF', '9', 'ORGAN', 9.000000, 0.07340946, true),
  ('GMTS SEWING NEEDLE', 'SN-033', 'SNG-005', 'DB X K 5 KK', '9', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-034', 'SNO-009', 'DB X K 5 KK', '9', 'ORGAN', 5.280000, 0.04306688, true),
  ('GMTS SEWING NEEDLE', 'SN-035', 'SNG-055', 'DB X 1 SAN 10 XS', '9', 'GROZ(FFG)', 6.200000, 0.05057096, true),
  ('GMTS SEWING NEEDLE', 'SN-036', 'SNO-090', 'DB X 1 KN', '9LP', 'ORGAN', 11.762680, 0.09594356, true),
  ('GMTS SEWING NEEDLE', 'SN-041', NULL, 'DB X 1', '10', 'GROZ(FFG)', 9.680000, 0.07895595, true),
  ('GMTS SEWING NEEDLE', 'SN-042', NULL, 'DB X 1', '10', 'GROZ(RG)', 9.680000, 0.07895595, true),
  ('GMTS SEWING NEEDLE', 'SN-043', 'SNO-010', 'DB X 1', '10', 'ORGAN', 8.129970, 0.06631297, true),
  ('GMTS SEWING NEEDLE', 'SN-044', NULL, 'DB X 1-KN', '10', 'GROZ(FFG)', 4.249150, 0.03465865, true),
  ('GMTS SEWING NEEDLE', 'SN-045', 'SNG-007', 'DB X K5 KK', '10', 'GROZ(FFG)', 4.300000, 0.03507341, true),
  ('GMTS SEWING NEEDLE', 'SN-046', NULL, 'DB X 1-KN', '10', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-047', NULL, 'DB X 1- SAN KN', '10', 'ORGAN', 6.200000, 0.05057096, true),
  ('GMTS SEWING NEEDLE', 'SN-048', 'SNO-122', 'DB X 1-KN', '10 LP', 'ORGAN', 16.567000, 0.13513051, true),
  ('GMTS SEWING NEEDLE', 'SN-053', NULL, 'DB X 1', '11', 'GROZ(FFG)', 4.300000, 0.03507341, true),
  ('GMTS SEWING NEEDLE', 'SN-054', NULL, 'DB X 1 K5', '11', 'GROZ(FFG)', 3.200000, 0.02610114, true),
  ('GMTS SEWING NEEDLE', 'SN-055', NULL, 'DB X 1', '11', 'GROZ(RG)', 4.300000, 0.03507341, true),
  ('GMTS SEWING NEEDLE', 'SN-056', 'SNO-012', 'DB X 1', '11', 'ORGAN', 8.129970, 0.06631297, true),
  ('GMTS SEWING NEEDLE', 'SN-057', NULL, 'DB X 5-K', '11', 'ORGAN', 4.300000, 0.03507341, true),
  ('GMTS SEWING NEEDLE', 'SN-058', 'SNO-120', 'DB X K5 KK', '11', 'ORGAN', 8.129980, 0.06631305, true),
  ('GMTS SEWING NEEDLE', 'SN-059', 'SNO-123', 'DB X 1 KN', '11 LP', 'ORGAN', 14.800000, 0.12071778, true),
  ('GMTS SEWING NEEDLE', 'SN-064', 'SNG-008', 'DB X 1', '12', 'GROZ(FFG)', 4.300000, 0.03507341, true),
  ('GMTS SEWING NEEDLE', 'SN-065', 'SNO-118', 'DB X 1', '12', 'ORGAN', 8.129970, 0.06631297, true),
  ('GMTS SEWING NEEDLE', 'SN-070', 'SNG-009', 'DB X 1', '14', 'GROZ(FFG)', 4.125720, 0.03365188, true),
  ('GMTS SEWING NEEDLE', 'SN-071', 'SNG-089', 'DB X 1', '14', 'GROZ(GEBEDUR)', 4.300000, 0.03507341, true),
  ('GMTS SEWING NEEDLE', 'SN-072', NULL, 'DB X 1', '14', 'ORGAN', 4.300000, 0.03507341, true),
  ('GMTS SEWING NEEDLE', 'SN-075', 'SNG-010', 'DB X 1', '18', 'GROZ(FFG)', 3.788610, 0.03090220, true),
  ('GMTS SEWING NEEDLE', 'SN-076', NULL, 'DB X 1', '18', 'ORGAN', 4.300000, 0.03507341, true),
  ('GMTS SEWING NEEDLE', 'SN-078', NULL, 'PH - C70 -', '14', 'GROZ(FFG)', 91.100000, 0.74306688, true),
  ('GMTS SEWING NEEDLE', 'SN-079', 'SNO-040', 'PH - C70 -', '14', 'ORGAN', 96.226790, 0.78488409, true),
  ('GMTS SEWING NEEDLE', 'SN-081', NULL, 'PH - C70 -', '16', 'GROZ(FFG)', 85.850000, 0.70024470, true),
  ('GMTS SEWING NEEDLE', 'SN-082', 'SNO-041', 'PH - C70 -', '16', 'ORGAN', 34.969940, 0.28523605, true),
  ('GMTS SEWING NEEDLE', 'SN-084', 'SNG-011', 'DC X 1', '7', 'GROZ(FFG)', 7.290150, 0.05946289, true),
  ('GMTS SEWING NEEDLE', 'SN-085', 'SNO-013', 'DC X 1', '7', 'ORGAN', 9.962040, 0.08125644, true),
  ('GMTS SEWING NEEDLE', 'SN-086', 'SNG-062', 'DC X 1 SAN 10', '7', 'GROZ(FFG)', 9.500000, 0.07748777, true),
  ('GMTS SEWING NEEDLE', 'SN-090', 'SNG-012', 'DC X 1', '8', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-091', NULL, 'DC X 1', '8', 'GROZ(RG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-092', 'SNO-015', 'DC X 1', '8', 'ORGAN', 13.295210, 0.10844380, true),
  ('GMTS SEWING NEEDLE', 'SN-093', NULL, 'DC X 1-KN', '8', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-094', 'SNO-016', 'DC X 1-KN', '8', 'ORGAN', 12.000000, 0.09787928, true),
  ('GMTS SEWING NEEDLE', 'SN-095', 'SNO-014', 'DC X 1-SF', '8', 'ORGAN', 23.323520, 0.19024078, true),
  ('GMTS SEWING NEEDLE', 'SN-096', NULL, 'DC X 1 SAN KK', '8', 'ORGAN', 11.950000, 0.09747145, true),
  ('GMTS SEWING NEEDLE', 'SN-097', NULL, 'DC X 1 SPD', '8', 'ORGAN', 14.000000, 0.11419250, true),
  ('GMTS SEWING NEEDLE', 'SN-098', NULL, 'DC X 1KN PD', '8', 'ORGAN', 14.500000, 0.11827080, true),
  ('GMTS SEWING NEEDLE', 'SN-099', 'SNG-013', 'DC X 1 27 SAN 10', '8', 'GROZ(FFG)', 9.800000, 0.07993475, true),
  ('GMTS SEWING NEEDLE', 'SN-100', 'SNG-063', 'DC X 1 27 SAN 10 XS', '8', 'GROZ(FFG)', 8.500000, 0.06933116, true),
  ('GMTS SEWING NEEDLE', 'SN-101', 'SNO-097', 'DC X 1-KN', '8 LP', 'ORGAN', 22.732300, 0.18541843, true),
  ('GMTS SEWING NEEDLE', 'SN-105', NULL, 'DC X 1', '9', 'GROZ(FFG)', 9.680000, 0.07895595, true),
  ('GMTS SEWING NEEDLE', 'SN-106', NULL, 'DC X 1', '9', 'GROZ(RG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-107', 'SNO-017', 'DC X 1', '9', 'ORGAN', 13.937090, 0.11367936, true),
  ('GMTS SEWING NEEDLE', 'SN-108', NULL, 'DC X 1', '9', 'ORGAN(RG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-109', 'SNG-015', 'DC X1 B 27 SAN 10', '9', 'GROZ(FFG)', 10.560000, 0.08613377, true),
  ('GMTS SEWING NEEDLE', 'SN-110', NULL, 'DC X1 SAN 10 XS', '9', 'GROZ(FFG)', 10.560000, 0.08613377, true),
  ('GMTS SEWING NEEDLE', 'SN-111', 'SNO-094', 'DC X 1 SF', '9', 'ORGAN', 1.980000, 0.01615008, true),
  ('GMTS SEWING NEEDLE', 'SN-112', NULL, 'DC X 1 KN', '9', 'ORGAN', 1.980000, 0.01615008, true),
  ('GMTS SEWING NEEDLE', 'SN-113', 'SNO-098', 'DC X 1 KN', '9 LP', 'ORGAN', 24.130920, 0.19682643, true),
  ('GMTS SEWING NEEDLE', 'SN-114', 'SNO-096', 'DC X 1 KN PD', '9', 'ORGAN', 19.500000, 0.15905383, true),
  ('GMTS SEWING NEEDLE', 'SN-118', 'SNG-016', 'DC X 1', '10', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-119', 'SNO-018', 'DC X 1', '10', 'ORGAN', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-120', 'SNG-017', 'DC X 1 27 SAN 10', '10', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-121', NULL, 'DC X 1 SAN 10  XS', '10', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-122', 'SNO-099', 'DC X 1 KN', '10LP', 'ORGAN', 24.167210, 0.19712243, true),
  ('GMTS SEWING NEEDLE', 'SN-125', 'SNG-018', 'DC X 1', '11', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-126', 'SNO-019', 'DC X 1', '11', 'ORGAN', 13.937090, 0.11367936, true),
  ('GMTS SEWING NEEDLE', 'SN-127', NULL, 'DC X 1-KN', '11', 'GROZ(FFG)', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-128', 'SNO-020', 'DC X 1-KN', '11', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-132', 'SNG-019', 'DC X 1', '12', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-133', 'SNO-119', 'DC X 1', '12', 'ORGAN', 10.540000, 0.08597064, true),
  ('GMTS SEWING NEEDLE', 'SN-135', 'SNG-020', 'DC X 1', '14', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-136', 'SNO-021', 'DC X 1', '14', 'ORGAN', 13.340620, 0.10881419, true),
  ('GMTS SEWING NEEDLE', 'SN-137', NULL, 'DC X 1', '14', 'GROZ(GEBEDUR)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-139', NULL, 'UY X 128', '7', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-140', 'SNO-054', 'UY X 128', '7', 'ORGAN', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-141', NULL, 'UY X 128-KN', '7', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-142', 'SNO-056', 'UY X 128-KN', '7', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-143', 'SNG-044', 'UY X 128- SAN-10', '7', 'GROZ(FFG)', 7.244630, 0.05909160, true),
  ('GMTS SEWING NEEDLE', 'SN-146', 'SNG-065', 'UY X 128', '8', 'GROZ(FFG)', 10.000000, 0.08156607, true),
  ('GMTS SEWING NEEDLE', 'SN-147', 'SNO-058', 'UY X 128', '8', 'ORGAN', 10.000000, 0.08156607, true),
  ('GMTS SEWING NEEDLE', 'SN-148', NULL, 'UY X 128-KN', '8', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-149', 'SNO-060', 'UY X 128-KN', '8', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-150', 'SNO-087', 'UY X 128- GAS KN', '8 LP', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-151', NULL, 'UY X 128- KK - KN', '8', 'GROZ(FFG)', 7.500000, 0.06117455, true),
  ('GMTS SEWING NEEDLE', 'SN-152', 'SNO-059', 'UY X 128- KK - KN', '8', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-153', 'SNO-057', 'UY X 128 GAS SPD+/SPD', '8', 'ORGAN', 17.500000, 0.14274062, true),
  ('GMTS SEWING NEEDLE', 'SN-154', NULL, 'UY X 128  KN PD', '8', 'ORGAN', 18.000000, 0.14681892, true),
  ('GMTS SEWING NEEDLE', 'SN-155', 'SNO-100', 'UY X 128- SF', '8', 'ORGAN', 17.355450, 0.14156158, true),
  ('GMTS SEWING NEEDLE', 'SN-156', 'SNO-103', 'UY X 128- GAS SF', '8 LP', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-157', 'SNG-067', 'UY X 128  SAN 10', '8', 'GROZ(FFG)', 10.400000, 0.08482871, true),
  ('GMTS SEWING NEEDLE', 'SN-158', NULL, 'UY X 128  SAN 10 XS', '8', 'GROZ(FFG)', 10.400000, 0.08482871, true),
  ('GMTS SEWING NEEDLE', 'SN-161', 'SNG-045', 'UY X 128 SAN 10', '9', 'GROZ(FFG)', 11.206970, 0.09141085, true),
  ('GMTS SEWING NEEDLE', 'SN-162', 'SNG-066', 'UY X 128', '9', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-163', 'SNO-061', 'UY X 128', '9', 'ORGAN', 20.097020, 0.16392349, true),
  ('GMTS SEWING NEEDLE', 'SN-164', NULL, 'UY X 128', '9 J', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-165', 'SNG-046', 'UY X 128', '9', 'GROZ(GEBEDUR)', 11.294850, 0.09212765, true),
  ('GMTS SEWING NEEDLE', 'SN-166', NULL, 'UY X 128-KN', '9', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-167', NULL, 'UY X 128-KN', '9', 'ORGAN', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-168', NULL, 'UY X 128- KK - KN', '9', 'GROZ(FFG)', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-169', 'SNO-064', 'UY X 128- KK - KN', '9', 'ORGAN', 10.283060, 0.08387488, true),
  ('GMTS SEWING NEEDLE', 'SN-170', NULL, 'UY X 128 -NY', '9 S', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-171', 'SNO-065', 'UY X 128 -LE', '9', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-172', 'SNO-063', 'UY X 128 GAS SPD', '9', 'ORGAN', 16.345400, 0.13332300, true),
  ('GMTS SEWING NEEDLE', 'SN-173', NULL, 'UY X 128 GAS KNPD', '9', 'ORGAN', 21.500000, 0.17536705, true),
  ('GMTS SEWING NEEDLE', 'SN-174', NULL, 'UY X 128-KK', '9', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-175', 'SNO-107', 'UY X 128 GAS KN', '9 LP', 'ORGAN', 22.993690, 0.18755049, true),
  ('GMTS SEWING NEEDLE', 'SN-176', 'SNO-101', 'UY X 128 SF', '9', 'ORGAN', 16.687970, 0.13611721, true),
  ('GMTS SEWING NEEDLE', 'SN-177', 'SNG-069', 'UY X 128 SAN 10 XS', '9', 'GROZ(FFG)', 10.382470, 0.08468573, true),
  ('GMTS SEWING NEEDLE', 'SN-178', 'SNO-104', 'UY X 128 SF', '9 LP', 'ORGAN', 27.720000, 0.22610114, true),
  ('GMTS SEWING NEEDLE', 'SN-179', 'SNO-106', 'UY X 128 -LE-SPD', '9', 'ORGAN', 26.300000, 0.21451876, true),
  ('GMTS SEWING NEEDLE', 'SN-181', NULL, 'UY X 128 SAN 10', '10', 'GROZ(FFG)', 12.980000, 0.10587276, true),
  ('GMTS SEWING NEEDLE', 'SN-182', NULL, 'UY X 128', '10', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-183', 'SNO-072', 'UY X 128', '10', 'ORGAN', 18.234360, 0.14873051, true),
  ('GMTS SEWING NEEDLE', 'SN-184', 'SNO-067', 'UY X 128 -NY2', '10', 'ORGAN', 16.289310, 0.13286550, true),
  ('GMTS SEWING NEEDLE', 'SN-185', NULL, 'UY X 128 -LE', '10 J', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-186', 'SNO-068', 'UYX 128 GAS', '10 SLP', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-187', NULL, 'UY X 128-KN', '10', 'GROZ(FFG)', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-188', NULL, 'UY X 128-KN', '10', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-189', 'SNG-047', 'UY X 128', '10', 'GROZ(GEBEDUR)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-190', NULL, 'UY X 128-KK-KN', '10', 'GROZ(FFG)', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-191', 'SNO-086', 'UY X 128-KK-KN', '10', 'ORGAN', 16.605320, 0.13544307, true),
  ('GMTS SEWING NEEDLE', 'SN-192', NULL, 'UY X128 SPD', '10', 'ORGAN', 17.500000, 0.14274062, true),
  ('GMTS SEWING NEEDLE', 'SN-193', 'SNO-070', 'UY X128 KN HP', '10', 'ORGAN', 17.251030, 0.14070987, true),
  ('GMTS SEWING NEEDLE', 'SN-194', 'SNO-102', 'UY X 128 SF', '10', 'ORGAN', 30.000000, 0.24469821, true),
  ('GMTS SEWING NEEDLE', 'SN-195', 'SNO-108', 'UY X 128 GAS KN', '10 LP', 'ORGAN', 38.434060, 0.31349152, true),
  ('GMTS SEWING NEEDLE', 'SN-196', 'SNG-070', 'UY X 128 SAN 10 XS', '10', 'GROZ(FFG)', 10.378070, 0.08464984, true),
  ('GMTS SEWING NEEDLE', 'SN-197', 'SNO-105', 'UY X 128 GAS SF', '10 LP', 'ORGAN', 21.800000, 0.17781403, true),
  ('GMTS SEWING NEEDLE', 'SN-200', NULL, 'UY X 128', '11', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-201', 'SNG-049', 'UY X 128', '11', 'GROZ(RG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-202', 'SNG-048', 'UY X 128', '11', 'GROZ(GEBEDUR)', 11.206670, 0.09140840, true),
  ('GMTS SEWING NEEDLE', 'SN-203', 'SNO-073', 'UY X 128', '11', 'ORGAN', 18.234360, 0.14873051, true),
  ('GMTS SEWING NEEDLE', 'SN-204', NULL, 'UY X 128', '11 J', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-205', 'SNO-079', 'UY X 128 -LE', '11', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-206', 'SNO-074', 'UY X 128 SPD', '11', 'ORGAN', 25.742920, 0.20997488, true),
  ('GMTS SEWING NEEDLE', 'SN-207', NULL, 'UY X 128 KN', '11', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-208', 'SNO-078', 'UY X 128 KN', '11', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-209', 'SNO-076', 'UY X 128 KN', '11 HP', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-210', NULL, 'UY X 128 KN', '11 LP', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-211', NULL, 'UY X 128-KK-KN', '11', 'GROZ(FFG)', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-212', 'SNO-075', 'UY X 128-KK-KN', '11', 'ORGAN', 10.449150, 0.08522961, true),
  ('GMTS SEWING NEEDLE', 'SN-213', NULL, 'UY X 128', '11', 'GROZ(GEBEDUR)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-214', NULL, 'UY X 128 KK', '11', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-220', 'SNO-080', 'UY X 128', '12', 'ORGAN', 18.234360, 0.14873051, true),
  ('GMTS SEWING NEEDLE', 'SN-221', NULL, 'UY X 128', '12 J', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-222', 'SNO-083', 'UY X 128 NY2 SPD', '12', 'ORGAN', 27.758040, 0.22641142, true),
  ('GMTS SEWING NEEDLE', 'SN-223', 'SNO-082', 'UYX 128-KN', '12', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-224', 'SNO-081', 'UY X 128-KN', '12 LP', 'ORGAN', 9.631220, 0.07855808, true),
  ('GMTS SEWING NEEDLE', 'SN-225', 'SNG-050', 'UY X 128', '12', 'GROZ(GEBEDUR)', 9.257330, 0.07550840, true),
  ('GMTS SEWING NEEDLE', 'SN-228', NULL, 'UY X 128', '14', 'GROZ(FFG)', 9.800000, 0.07993475, true),
  ('GMTS SEWING NEEDLE', 'SN-229', 'SNG-052', 'UY X 128', '14', 'GROZ(RG)', 9.800000, 0.07993475, true),
  ('GMTS SEWING NEEDLE', 'SN-230', 'SNG-051', 'UY X 128', '14', 'GROZ(GEBEDUR)', 11.044860, 0.09008858, true),
  ('GMTS SEWING NEEDLE', 'SN-231', 'SNO-084', 'UY X 128', '14', 'ORGAN', 7.990000, 0.06517129, true),
  ('GMTS SEWING NEEDLE', 'SN-232', NULL, 'UY X 128', '14-J', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-236', NULL, 'DP X 5', '7', 'GROZ(FFG)', 7.000000, 0.05709625, true),
  ('GMTS SEWING NEEDLE', 'SN-237', 'SNO-022', 'DP X 5', '7', 'ORGAN', 7.000000, 0.05709625, true),
  ('GMTS SEWING NEEDLE', 'SN-240', 'SNG-056', 'DP X 5', '8', 'GROZ(FFG)', 4.590000, 0.03743883, true),
  ('GMTS SEWING NEEDLE', 'SN-241', NULL, 'DP X 5', '8', 'ORGAN', 5.000000, 0.04078303, true),
  ('GMTS SEWING NEEDLE', 'SN-242', 'SNG-057', 'DP X 5 SAN', '8', 'GROZ(FFG)', 6.200000, 0.05057096, true),
  ('GMTS SEWING NEEDLE', 'SN-243', NULL, 'DP X 5-KN', '8', 'GROZ(FFG)', 5.000000, 0.04078303, true),
  ('GMTS SEWING NEEDLE', 'SN-244', 'SNO-091', 'DP X 5-KN', '8', 'ORGAN', 10.000000, 0.08156607, true),
  ('GMTS SEWING NEEDLE', 'SN-245', 'SNO-092', 'DP X 5-KN', '8 LP', 'ORGAN', 7.500000, 0.06117455, true),
  ('GMTS SEWING NEEDLE', 'SN-248', 'SNG-023', 'DP X 5', '9', 'GROZ(FFG)', 4.290000, 0.03499184, true),
  ('GMTS SEWING NEEDLE', 'SN-249', 'SNG-024', 'DP X 5 SAN 10', '9', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-250', 'SNO-023', 'DP X 5', '9', 'ORGAN', 4.780000, 0.03898858, true),
  ('GMTS SEWING NEEDLE', 'SN-251', NULL, 'DP X 5-KN', '9', 'GROZ(FFG)', 7.500000, 0.06117455, true),
  ('GMTS SEWING NEEDLE', 'SN-252', 'SNO-093', 'DP X 5-KN', '9 LP', 'ORGAN', 12.420000, 0.10130506, true),
  ('GMTS SEWING NEEDLE', 'SN-253', 'SNG-061', 'DP X 5', '9', 'GROZ(GEBEDUR)', 6.200000, 0.05057096, true),
  ('GMTS SEWING NEEDLE', 'SN-254', 'SNO-024', 'DP X 5-KN', '9', 'ORGAN', 7.500000, 0.06117455, true),
  ('GMTS SEWING NEEDLE', 'SN-255', 'SNG-059', '(DPX5)134 SAN 10XS', '10', 'GROZ(FFG)', 6.180000, 0.05040783, true),
  ('GMTS SEWING NEEDLE', 'SN-256', 'SNG-072', '(DPX5)134 SAN 10', '10', 'GROZ(FFG)', 6.200000, 0.05057096, true),
  ('GMTS SEWING NEEDLE', 'SN-258', NULL, 'DP X 5', '11', 'GROZ(FFG)', 5.800000, 0.04730832, true),
  ('GMTS SEWING NEEDLE', 'SN-259', NULL, 'DP X 5', '11', 'GROZ(GEB)', 5.800000, 0.04730832, true),
  ('GMTS SEWING NEEDLE', 'SN-260', NULL, 'DP X 5', '11', 'GROZ(RG)', 5.800000, 0.04730832, true),
  ('GMTS SEWING NEEDLE', 'SN-261', 'SNO-025', 'DP X 5', '11', 'ORGAN', 8.129971, 0.06631298, true),
  ('GMTS SEWING NEEDLE', 'SN-262', NULL, 'DP X 5-KN', '11', 'GROZ(FFG)', 7.500000, 0.06117455, true),
  ('GMTS SEWING NEEDLE', 'SN-263', 'SNO-026', 'DP X 5-KN', '11', 'ORGAN', 7.500000, 0.06117455, true),
  ('GMTS SEWING NEEDLE', 'SN-265', 'SNG-079', 'DP X 5', '14', 'GROZ(FFG)', 4.090000, 0.03336052, true),
  ('GMTS SEWING NEEDLE', 'SN-266', 'SNO-027', 'DP X 5', '14', 'ORGAN', 7.000000, 0.05709625, true),
  ('GMTS SEWING NEEDLE', 'SN-267', 'SNG-035', 'TV X 64', '9', 'GROZ(FFG)', 7.110000, 0.05799347, true),
  ('GMTS SEWING NEEDLE', 'SN-268', NULL, 'TV X 64', '9', 'ORGAN', 7.790000, 0.06353997, true),
  ('GMTS SEWING NEEDLE', 'SN-269', 'SNG-036', 'TV X 64', '10', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-270', NULL, 'TV X 64', '10', 'ORGAN', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-271', 'SNG-037', 'TV X 64', '11', 'GROZ(FFG)', 7.270000, 0.05929853, true),
  ('GMTS SEWING NEEDLE', 'SN-272', NULL, 'TV X 64', '11', 'ORGAN', 8.790000, 0.07169657, true),
  ('GMTS SEWING NEEDLE', 'SN-273', NULL, 'TV X 7', '11', 'GROZ(FFG)', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-274', 'SNO-047', 'TV X 7', '11', 'ORGAN', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-275', NULL, 'TV X 64', '14', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-276', 'SNO-048', 'TV X 64', '14', 'ORGAN', 8.900000, 0.07259380, true),
  ('GMTS SEWING NEEDLE', 'SN-277', 'SNG-038', 'UO X 113(UO X 1)', '9', 'GROZ(FFG)', 10.750000, 0.08768352, true),
  ('GMTS SEWING NEEDLE', 'SN-278', 'SNO-049', 'UO X 113(UO X 1)', '9', 'ORGAN', 10.420000, 0.08499184, true),
  ('GMTS SEWING NEEDLE', 'SN-279', 'SNO-110', 'UO X 113(UO X 1) SPD', '9', 'ORGAN', 22.100000, 0.18026101, true),
  ('GMTS SEWING NEEDLE', 'SN-280', 'SNO-112', 'UO X 113(UO X 1)', '9 LP', 'ORGAN', 22.100000, 0.18026101, true),
  ('GMTS SEWING NEEDLE', 'SN-283', NULL, 'UO X 113(UO X 1)', '10', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-284', 'SNO-109', 'UO X 113(UO X 1)', '10', 'ORGAN', 16.590000, 0.13531811, true),
  ('GMTS SEWING NEEDLE', 'SN-285', 'SNO-113', 'UO X 113(UO X 1)SLP', '10', 'ORGAN', 22.100000, 0.18026101, true),
  ('GMTS SEWING NEEDLE', 'SN-287', 'SNG-039', 'UO X 113(UO X 1)', '11', 'GROZ(FFG)', 15.070000, 0.12292007, true),
  ('GMTS SEWING NEEDLE', 'SN-288', NULL, 'UO X 113(UO X 1)', '11', 'GROZ(RG)', 15.070000, 0.12292007, true),
  ('GMTS SEWING NEEDLE', 'SN-289', 'SNO-050', 'UO X 113(UO X 1)', '11', 'ORGAN', 15.700000, 0.12805873, true),
  ('GMTS SEWING NEEDLE', 'SN-290', 'SNO-125', 'UO X 113(UO X 1) GS', '11', 'ORGAN', 26.000000, 0.21207178, true),
  ('GMTS SEWING NEEDLE', 'SN-293', NULL, 'UO X 113(UO X 1)', '12', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-294', 'SNO-053', 'UO X 163', '9', 'ORGAN', 10.700000, 0.08727569, true),
  ('GMTS SEWING NEEDLE', 'SN-295', 'SNG-042', 'UO X 163', '10', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-296', 'SNO-052', 'UO X 163', '11', 'ORGAN', 10.560000, 0.08613377, true),
  ('GMTS SEWING NEEDLE', 'SN-297', 'SNG-043', 'UO X 163', '12', 'GROZ(FFG)', 10.560000, 0.08613377, true),
  ('GMTS SEWING NEEDLE', 'SN-298', NULL, 'UO X 113(UO X 1)', '14', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-299', 'SNO-051', 'UO X 113(UO X 1)', '14', 'ORGAN', 21.860000, 0.17830343, true),
  ('GMTS SEWING NEEDLE', 'SN-300', 'SNG-029', 'DP X 17', '9', 'GROZ(FFG)', 4.430000, 0.03613377, true),
  ('GMTS SEWING NEEDLE', 'SN-301', 'SNO-157', 'DP X 17', '9', 'ORGAN', 7.000000, 0.05709625, true),
  ('GMTS SEWING NEEDLE', 'SN-305', 'SNG-030', 'DP X 17', '10', 'GROZ(FFG)', 5.800000, 0.04730832, true),
  ('GMTS SEWING NEEDLE', 'SN-306', NULL, 'DP X 17', '11', 'GROZ(FFG)', 5.800000, 0.04730832, true),
  ('GMTS SEWING NEEDLE', 'SN-307', NULL, 'DP X 17', '11', 'GROZ(RG)', 5.800000, 0.04730832, true),
  ('GMTS SEWING NEEDLE', 'SN-308', 'SNO-028', 'DP X 17', '11', 'ORGAN', 15.098520, 0.12315269, true),
  ('GMTS SEWING NEEDLE', 'SN-310', NULL, 'DP X 17 kk(DPxN31)', '11', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-311', NULL, 'DP X 17 kk(DPxN31)', '11', 'ORGAN', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-312', 'SNO-029', 'DP X 17 kk(DPxN31)', '11 J', 'ORGAN', 7.130000, 0.05815661, true),
  ('GMTS SEWING NEEDLE', 'SN-313', NULL, 'DP X 17 kk(DPxN31)', '14', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-314', 'SNO-030', 'DP X 17 kk(DPxN31)', '14', 'ORGAN', 7.060000, 0.05758564, true),
  ('GMTS SEWING NEEDLE', 'SN-315', NULL, 'DP X 17 kk(DPxN31)', '14 J', 'ORGAN', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-316', NULL, 'DV X 57', '11', 'GROZ(FFG)', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-317', 'SNO-031', 'DV X 57', '11', 'ORGAN', 1.090000, 0.00889070, true),
  ('GMTS SEWING NEEDLE', 'SN-318', 'SNO-032', 'DV X 57', '12', 'ORGAN', 29.732460, 0.24251599, true),
  ('GMTS SEWING NEEDLE', 'SN-319', 'SNG-031', 'DV X 57', '14', 'GROZ(FFG)', 9.570000, 0.07805873, true),
  ('GMTS SEWING NEEDLE', 'SN-320', 'SNO-033', 'DV X 57', '14', 'ORGAN', 17.830000, 0.14543230, true),
  ('GMTS SEWING NEEDLE', 'SN-321', NULL, 'DV X 57', '14+', 'ORGAN', 22.487000, 0.18341762, true),
  ('GMTS SEWING NEEDLE', 'SN-322', 'SNG-032', 'DV X 57', '16', 'GROZ(FFG)', 11.300000, 0.09216966, true),
  ('GMTS SEWING NEEDLE', 'SN-323', 'SNO-034', 'DV X 57', '16', 'ORGAN', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-324', 'SNO-121', 'DV X 57', '10', 'ORGAN', 25.600000, 0.20880914, true),
  ('GMTS SEWING NEEDLE', 'SN-328', 'SNO-035', 'FLX 118-GCS', '8', 'ORGAN', 32.900000, 0.26835237, true),
  ('GMTS SEWING NEEDLE', 'SN-329', NULL, 'FLX 118-GCS', '9', 'GROZ(FFG)', 30.000000, 0.24469821, true),
  ('GMTS SEWING NEEDLE', 'SN-330', 'SNO-036', 'FLX 118-GCS', '9', 'ORGAN', 46.340840, 0.37798401, true),
  ('GMTS SEWING NEEDLE', 'SN-331', NULL, 'FLX 118-GCS', '10', 'GROZ(FFG)', 33.915000, 0.27663132, true),
  ('GMTS SEWING NEEDLE', 'SN-332', NULL, 'FLX 118-GCS', '10', 'ORGAN', 33.915000, 0.27663132, true),
  ('GMTS SEWING NEEDLE', 'SN-333', NULL, 'FLX 118-GCS', '11', 'GROZ(FFG)', 30.000000, 0.24469821, true),
  ('GMTS SEWING NEEDLE', 'SN-334', 'SNO-037', 'FLX 118-GCS', '11', 'ORGAN', 48.926200, 0.39907178, true),
  ('GMTS SEWING NEEDLE', 'SN-335', 'SNO-038', 'FLX 118-GCS', '12', 'ORGAN', 35.000000, 0.28548124, true),
  ('GMTS SEWING NEEDLE', 'SN-336', 'SNO-114', 'FLX 118-GCS NY2', '9', 'ORGAN', 33.753920, 0.27531746, true),
  ('GMTS SEWING NEEDLE', 'SN-337', 'SNO-115', 'FLX 118-GCS NY2', '10', 'ORGAN', 33.402660, 0.27245237, true),
  ('GMTS SEWING NEEDLE', 'SN-338', 'SNO-116', 'FLX 118-GCS NY2', '9', 'ORGAN', 37.572800, 0.30646656, true),
  ('GMTS SEWING NEEDLE', 'SN-339', 'SNO-117', 'FLX 118-GCS NY2', '10', 'ORGAN', 36.871290, 0.30074462, true),
  ('GMTS SEWING NEEDLE', 'SN-340', 'SNG-021', 'DM X 13', '9', 'GROZ(FFG)', 7.500000, 0.06117455, true),
  ('GMTS SEWING NEEDLE', 'SN-341', NULL, 'DM X 13', '9', 'ORGAN', 7.500000, 0.06117455, true),
  ('GMTS SEWING NEEDLE', 'SN-343', 'SNG-022', 'DM X 13', '10', 'GROZ(FFG)', 7.500000, 0.06117455, true),
  ('GMTS SEWING NEEDLE', 'SN-344', NULL, 'DM X 13', '10', 'ORGAN', 7.500000, 0.06117455, true),
  ('GMTS SEWING NEEDLE', 'SN-346', NULL, 'LW X 6 T', '65/9', 'GROZ(FFG)', 3.800000, 0.03099511, true),
  ('GMTS SEWING NEEDLE', 'SN-348', NULL, 'LW X 6 T', '75/11', 'GROZ(FFG)', 3.800000, 0.03099511, true),
  ('GMTS SEWING NEEDLE', 'SN-350', NULL, 'LW X 6 T/251 EU', '12', 'GROZ(FFG)', 3.800000, 0.03099511, true),
  ('GMTS SEWING NEEDLE', 'SN-351', 'SNG-077', 'LW X 6 T/1669 E', '14', 'GROZ(FFG)', 33.550000, 0.27365416, true),
  ('GMTS SEWING NEEDLE', 'SN-352', 'SNG-078', 'LW X 6 T/1669 E', '16', 'GROZ(FFG)', 33.550000, 0.27365416, true),
  ('GMTS SEWING NEEDLE', 'SN-355', 'SNG-033', 'PF X 134 KK', '12', 'GROZ(FFG)', 5.600000, 0.04567700, true),
  ('GMTS SEWING NEEDLE', 'SN-356', NULL, 'MM X 75', '118', 'ORGAN', 7.000000, 0.05709625, true),
  ('GMTS SEWING NEEDLE', 'SN-357', 'SNO-128', 'FTD -61', '40CSM', 'ORGAN', 5.600000, 0.04567700, true),
  ('GMTS SEWING NEEDLE', 'SN-360', NULL, 'SM X 1014 B', '10', 'GROZ(FFG)', 33.000000, 0.26916803, true),
  ('GMTS SEWING NEEDLE', 'SN-361', 'SNO-042', 'SM X 1014 B', '10', 'ORGAN', 35.000000, 0.28548124, true),
  ('GMTS SEWING NEEDLE', 'SN-400', 'SNG-005', 'DB X K5-KK NO-09 GROZ', '9', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-401', 'SNG-017', 'DCX1SAN,NO-10,GROZ', '10', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-402', 'SNG-023', 'DP X 5-FFG,NO-09,GROZ', '9', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-403', 'SNG-024', 'DP X 5-SAN 10,NO-09,GROZ', '9', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-404', 'SNG-025', 'DP X 5-FFG,NO-11,GROZ', '11', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-405', 'SNG-030', 'DP X 17-FFG,NO-10,GROZ', '10', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-406', 'SNG-032', 'DV X 57-FFG,NO-16,GROZ', '16', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-407', 'SNG-033', 'PF X 134 KK-FFG,NO-12,GROZ', '12', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-408', 'SNG-034', 'TV X 07-FFG,NO-11,GROZ', '11', 'GROZ', 8.600000, 0.07014682, true),
  ('GMTS SEWING NEEDLE', 'SN-409', 'SNG-036', 'TV X 64-FFG,NO-10,GROZ', '10', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-410', 'SNG-042', 'UO/UY X 163-FFG,NO-10,GROZ', '10', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-411', 'SNG-043', 'UO/UY X 163-FFG,NO-12,GROZ', '12', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-412', 'SNG-044', 'UY X 128-SAN,NO-07,GROZ', '7', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-413', 'SNG-047', 'UY X 128-GEBEDUR-FFG,NO-10,GROZ', '10', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-414', 'SNG-048', 'UY X 128-GEBEDUR,NO-11,GROZ', '11', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-415', 'SNG-049', 'UY X 128-RG,NO-11,GROZ', '11', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-416', 'SNG-052', 'UY X 128-RG,NO-14,GROZ', '14', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-417', 'SNG-053', 'DB X 1-SAN 10-XS-FFG AI,NO-08,GROZ', '8', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-418', 'SNG-054', 'DB X 1-GEBEDURE-FFG ,NO-08,GROZ', '8', 'GROZ', 6.200000, 0.05057096, true),
  ('GMTS SEWING NEEDLE', 'SN-419', 'SNG-055', 'DB X 1-SAN 10-XS-FFG AI,NO-09,GROZ', '9', 'GROZ', 4.300000, 0.03507341, true),
  ('GMTS SEWING NEEDLE', 'SN-420', 'SNG-056', 'DP X 5-FFG,NO-08,GROZ', '8', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-421', 'SNG-057', 'DP X 5-SAN 10-FFG,NO-08,GROZ', '8', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-422', 'SNG-058', 'DP X 5-134SAN 10XS-FFG AI,NO-09,GROZ', '9', 'GROZ', 6.200000, 0.05057096, true),
  ('GMTS SEWING NEEDLE', 'SN-423', 'SNG-059', 'DP X 5-134SAN 10XS-FFG AI,NO-10,GROZ', '10', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-424', 'SNG-060', 'DP X 5-GEBEDURE-FFG,NO-08,GROZ', '8', 'GROZ', 6.200000, 0.05057096, true),
  ('GMTS SEWING NEEDLE', 'SN-425', 'SNG-061', 'DP X 5-GEBEDURE-FFG,NO-09,GROZ', '9', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-426', 'SNG-064', 'DCX27-GEBEDURE-FFG,NO-08,GROZ', '8', 'GROZ', 10.400000, 0.08482871, true),
  ('GMTS SEWING NEEDLE', 'SN-427', 'SNG-067', 'UY X128-SAN 10-FFG,NO-08,GROZ', '8', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-428', 'SNG-068', 'UY X128-SAN 10-FFG,NO-10,GROZ', '10', 'GROZ', 6.200000, 0.05057096, true),
  ('GMTS SEWING NEEDLE', 'SN-429', 'SNG-069', 'UY X128-SAN 10-XS-FFG AI,NO-09,GROZ', '9', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-430', 'SNG-070', 'UY X128-SAN 10-XS-FFG AI,NO-10,GROZ', '10', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-431', 'SNG-072', 'DP X 5-SAN 10,NO-10,GROZ', '10', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-432', 'SNG-079', 'DP X 5-FFG,NO-14,GROZ', '14', 'GROZ', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-433', 'SNO-001', 'DB X 1 SPD,NO-07,ORGAN', '7', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-434', 'SNO-005', 'DB X K5KK,NO-08,ORGAN', '8', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-435', 'SNO-008', 'DB X 1 KN,NO-09,ORGAN', '9', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-436', 'SNO-020', 'DC X 1 KN,NO-11,ORGAN', '11', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-437', 'SNO-024', 'DP X 5 KN,NO-09,ORGAN', '9', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-438', 'SNO-027', 'DP X 5,NO-14,ORGAN', '14', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-439', 'SNO-029', 'DP X 17 KK,NO-11 J,ORGAN', '11', 'ORGAN', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-440', 'SNO-030', 'DP X 17 KK,NO-14 S,ORGAN', '14', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-441', 'SNO-034', 'DV X 57,NO-16,ORGAN', '16', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-442', 'SNO-035', 'FL X 118-GCS,NO-08,ORGAN', '8', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-443', 'SNO-038', 'FL X 118-GCS,NO-12,ORGAN', '12', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-444', 'SNO-039', 'MM X 75,NO-118,ORGAN', '118', 'ORGAN', 7.000000, 0.05709625, true),
  ('GMTS SEWING NEEDLE', 'SN-445', 'SNO-042', 'SM X 1014B,NO-10,ORGAN', '10', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-446', 'SNO-043', 'TQ X 1,NO-09,ORGAN', '9', 'ORGAN', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-447', 'SNO-044', 'TQ X 1,NO-11,ORGAN', '11', 'ORGAN', 7.300000, 0.05954323, true),
  ('GMTS SEWING NEEDLE', 'SN-448', 'SNO-045', 'TQ X 1,NO-14,ORGAN', '14', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-449', 'SNO-046', 'TQ X 1,NO-16,ORGAN', '16', 'ORGAN', 11.419000, 0.09314029, true),
  ('GMTS SEWING NEEDLE', 'SN-450', 'SNO-047', 'TV X 7,NO-11,ORGAN', '11', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-451', 'SNO-048', 'TV X 64,NO-14,ORGAN', '14', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-452', 'SNO-053', 'UO X 163,NO-09,ORGAN', '9', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-453', 'SNO-055', 'UY X 128 KKKN,NO-07,ORGAN', '7', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-454', 'SNO-057', 'UY X 128 SPD,NO-08,ORGAN', '8', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-455', 'SNO-060', 'UY X 128 KN,NO-08,ORGAN', '8', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-456', 'SNO-065', 'UY X 128 LE,NO-09 J,ORGAN', '9', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-457', 'SNO-070', 'UY X 128 KN,NO-10 HP,ORGAN', '10', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-458', 'SNO-078', 'UY X 128 KN,NO-11,ORGAN', '11', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-459', 'SNO-079', 'UY X 128 LE,NO-11,ORGAN', '11', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-460', 'SNO-085', 'DP X 5,NO-20,ORGAN', '20', 'ORGAN', 6.300000, 0.05138662, true),
  ('GMTS SEWING NEEDLE', 'SN-461', 'SNO-088', 'DB X 1 KN,NO-08,ORGAN', '8', 'ORGAN', 17.500000, 0.14274062, true),
  ('GMTS SEWING NEEDLE', 'SN-462', 'SNO-091', 'DP X 5, KN,NO-08,ORGAN', '8', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-463', 'SNO-092', 'DP X 5, KN-LP,NO-08,ORGAN', '8', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-464', 'SNO-096', 'DC X 27 KN-PD,NO-09,ORGAN', '9', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-465', 'SNO-106', 'UY X 128 LE-SPD,NO-09,ORGAN', '9', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-466', 'SNO-110', 'UO X 113GS S-PD,NO-09,ORGAN', '9', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-467', 'SNO-111', 'UO X 113GS S-PD,NO-10,ORGAN', '10', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-468', 'SNO-112', 'UO X 113GS S-LP,NO-09,ORGAN', '9', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-469', 'SNO-118', 'DBX1 12 B/S/J ,ORGAN', NULL, 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-470', 'SNO-123', 'DB X 1,KN-LP,NO-11 ORGAN', '11', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-471', 'SNO-124', 'FL X 118,GCS-SK-S/B BALL,NO-10,ORGAN', '10', 'ORGAN', 39.900000, 0.32544861, true),
  ('GMTS SEWING NEEDLE', 'SN-472', 'SNO-125', 'UO X113,GS-NY2/+SLP,NO-11,ORGAN', '11', 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-473', 'SNO-126', 'DV X57,LE-NY2 SLP,NO-14,ORGAN', '14', 'ORGAN', 30.000000, 0.24469821, true),
  ('GMTS SEWING NEEDLE', 'SN-474', 'SNO-128', 'FTD-61,40CSM', NULL, 'ORGAN', NULL, NULL, true),
  ('GMTS SEWING NEEDLE', 'SN-475', 'SNO-188', 'DB X 1 NS,NO-LP', '8', 'ORGAN', 16.800000, 0.13703100, true),
  ('GMTS SEWING NEEDLE', 'SN-476', 'SNO-189', 'DP X 5 NS', '8', 'ORGAN', 14.500000, 0.11827080, true),
  ('GMTS SEWING NEEDLE', 'SN-477', 'SNO-190', 'DP X 5 NS', '9', 'ORGAN', 14.500000, 0.11827080, true),
  ('GMTS SEWING NEEDLE', 'SN-478', 'SNO-191', 'DC X 1 NS', '8', 'ORGAN', 23.500000, 0.19168026, true),
  ('GMTS SEWING NEEDLE', 'SN-479', 'SNO-193', 'DV X 43', '14', 'ORGAN', 16.610000, 0.13548124, true),
  ('GMTS SEWING NEEDLE', 'SN-480', 'SNG-100', 'LWX1669E', '14', 'GROZ', 60.800000, 0.49592170, true),
  ('GMTS SEWING NEEDLE', 'SN-481', 'SNG-101', 'LWX1669E', '12', 'GROZ', 60.800000, 0.49592170, true),
  ('GMTS SEWING NEEDLE', 'SN-482', 'SNO-245', 'DV X 43', '12', 'ORGAN', 17.500000, 0.14274062, true),
  ('GMTS SEWING NEEDLE', 'SN-483', 'SNO-246', 'DP X 17 SK,SPD', '14', 'ORGAN', 27.000000, 0.22022838, true),
  ('GMTS SEWING NEEDLE', 'SN-484', 'SNO-134', 'DB X 1 SPD', '12', 'ORGAN', 18.000000, 0.14681892, true);

INSERT INTO public.normal_needle_floor_assignments(needle_item_id, floor_id)
SELECT needle.id, floor.id FROM public.normal_needle_items AS needle
CROSS JOIN public.floors AS floor WHERE floor.active = true;

-- 41 idle items from Excel/IdleNeedleUnitPrice.xlsx, UNIT PRICE.
CREATE TABLE public.idle_needle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description_item TEXT NOT NULL,
  item_code TEXT NOT NULL UNIQUE CHECK (item_code = upper(btrim(item_code)) AND item_code LIKE 'IN%'),
  tac_inventory_item_code TEXT,
  needle_type TEXT NOT NULL,
  size_dia TEXT,
  brand TEXT NOT NULL,
  unit_price_bdt NUMERIC(18,6) CHECK (unit_price_bdt >= 0),
  unit_price_usd NUMERIC(18,8) CHECK (unit_price_usd >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_idle_needle_items_brand ON public.idle_needle_items(brand);
CREATE INDEX idx_idle_needle_items_type ON public.idle_needle_items(needle_type);
CREATE TRIGGER trg_idle_needle_items_updated_at BEFORE UPDATE ON public.idle_needle_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.idle_needle_floor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  needle_item_id UUID NOT NULL REFERENCES public.idle_needle_items(id) ON DELETE CASCADE,
  floor_id UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (needle_item_id, floor_id)
);
CREATE INDEX idx_idle_needle_floor_assignments_floor ON public.idle_needle_floor_assignments(floor_id);
CREATE TRIGGER trg_idle_needle_floor_assignments_updated_at BEFORE UPDATE ON public.idle_needle_floor_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.idle_needle_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idle_needle_floor_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON public.idle_needle_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read ON public.idle_needle_items FOR SELECT TO authenticated USING (true);
CREATE POLICY service_role_all ON public.idle_needle_floor_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read ON public.idle_needle_floor_assignments FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.idle_needle_items, public.idle_needle_floor_assignments TO authenticated;
GRANT ALL ON public.idle_needle_items, public.idle_needle_floor_assignments TO service_role;

-- One transaction for replacing an item's selections, including an empty set.
-- A wrong-catalog item ID or invalid floor fails before any changes commit.
CREATE OR REPLACE FUNCTION public.set_idle_needle_floors(p_item_id UUID, p_floor_ids UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1 FROM public.idle_needle_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Needle does not exist in the idle catalog.';
  END IF;
  DELETE FROM public.idle_needle_floor_assignments WHERE needle_item_id = p_item_id;
  INSERT INTO public.idle_needle_floor_assignments(needle_item_id, floor_id)
  SELECT p_item_id, floor_id FROM (SELECT DISTINCT unnest(coalesce(p_floor_ids, '{}'::UUID[])) AS floor_id) AS chosen;
END;
$$;
REVOKE ALL ON FUNCTION public.set_idle_needle_floors(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_idle_needle_floors(UUID, UUID[]) TO service_role;

INSERT INTO public.idle_needle_items (
  description_item, item_code, tac_inventory_item_code, needle_type, size_dia,
  brand, unit_price_bdt, unit_price_usd, active
) VALUES
  ('GMTS SEWING NEEDLE', 'IN-001', NULL, 'DB X 1', '7', 'ORGAN', 7.500000, 0.06818182, true),
  ('GMTS SEWING NEEDLE', 'IN-002', NULL, 'DB X 1', '8', 'ORGAN', 4.300000, 0.03909091, true),
  ('GMTS SEWING NEEDLE', 'IN-003', NULL, 'DB X 1', '9', 'ORGAN', 5.800000, 0.05272727, true),
  ('GMTS SEWING NEEDLE', 'IN-004', NULL, 'DB X 1', '10', 'ORGAN', 9.680000, 0.08800000, true),
  ('GMTS SEWING NEEDLE', 'IN-005', NULL, 'DB X 1', '11', 'ORGAN', 4.300000, 0.03909091, true),
  ('GMTS SEWING NEEDLE', 'IN-006', NULL, 'DB X 1', '12', 'ORGAN', 4.300000, 0.03909091, true),
  ('GMTS SEWING NEEDLE', 'IN-007', NULL, 'DB X 1', '14', 'ORGAN', 4.300000, 0.03909091, true),
  ('GMTS SEWING NEEDLE', 'IN-008', NULL, 'DC X 1', '7', 'ORGAN', 7.300000, 0.06636364, true),
  ('GMTS SEWING NEEDLE', 'IN-009', NULL, 'DC X 1', '8', 'ORGAN', 7.300000, 0.06636364, true),
  ('GMTS SEWING NEEDLE', 'IN-010', NULL, 'DC X 1', '9', 'ORGAN', 9.680000, 0.08800000, true),
  ('GMTS SEWING NEEDLE', 'IN-011', NULL, 'DC X 1', '10', 'ORGAN', 7.300000, 0.06636364, true),
  ('GMTS SEWING NEEDLE', 'IN-012', NULL, 'DC X 1', '11', 'ORGAN', 7.300000, 0.06636364, true),
  ('GMTS SEWING NEEDLE', 'IN-013', NULL, 'DC X 1', '12', 'ORGAN', 7.300000, 0.06636364, true),
  ('GMTS SEWING NEEDLE', 'IN-014', NULL, 'DC X 1', '14', 'ORGAN', 10.540000, 0.09581818, true),
  ('GMTS SEWING NEEDLE', 'IN-015', NULL, 'UY X 128', '7', 'ORGAN', 1.760000, 0.01600000, true),
  ('GMTS SEWING NEEDLE', 'IN-016', NULL, 'UY X 128', '8', 'ORGAN', 1.760000, 0.01600000, true),
  ('GMTS SEWING NEEDLE', 'IN-017', NULL, 'UY X 128', '9', 'ORGAN', 11.300000, 0.10272727, true),
  ('GMTS SEWING NEEDLE', 'IN-018', NULL, 'UY X 128', '9 LP', 'ORGAN', 2.860000, 0.02600000, true),
  ('GMTS SEWING NEEDLE', 'IN-019', NULL, 'UY X 128 SPD', '9', 'ORGAN', 17.500000, 0.15909091, true),
  ('GMTS SEWING NEEDLE', 'IN-020', NULL, 'UY X 128', '10', 'ORGAN', 11.300000, 0.10272727, true),
  ('GMTS SEWING NEEDLE', 'IN-021', NULL, 'UY X 128', '11', 'ORGAN', 11.300000, 0.10272727, true),
  ('GMTS SEWING NEEDLE', 'IN-022', NULL, 'UY X 128', '12', 'ORGAN', 2.310000, 0.02100000, true),
  ('GMTS SEWING NEEDLE', 'IN-023', NULL, 'UY X 128', '14', 'ORGAN', 9.800000, 0.08909091, true),
  ('GMTS SEWING NEEDLE', 'IN-024', NULL, 'DP X 5', '9', 'ORGAN', 4.300000, 0.03909091, true),
  ('GMTS SEWING NEEDLE', 'IN-025', NULL, 'DP X 5', '11', 'ORGAN', 5.800000, 0.05272727, true),
  ('GMTS SEWING NEEDLE', 'IN-026', NULL, 'DP X 5', '14', 'ORGAN', 4.300000, 0.03909091, true),
  ('GMTS SEWING NEEDLE', 'IN-027', NULL, 'TV X 64', '9', 'ORGAN', 7.300000, 0.06636364, true),
  ('GMTS SEWING NEEDLE', 'IN-028', NULL, 'TV X 64', '11', 'ORGAN', 7.300000, 0.06636364, true),
  ('GMTS SEWING NEEDLE', 'IN-029', NULL, 'TV X 64', '14', 'ORGAN', 8.900000, 0.08090909, true),
  ('GMTS SEWING NEEDLE', 'IN-030', NULL, 'UY X 113(UO X 1)', '9', 'ORGAN', 11.300000, 0.10272727, true),
  ('GMTS SEWING NEEDLE', 'IN-031', NULL, 'UY X 113(UO X 1)', '11', 'ORGAN', 15.070000, 0.13700000, true),
  ('GMTS SEWING NEEDLE', 'IN-032', NULL, 'UY X 113(UO X 1)', '14', 'ORGAN', 10.700000, 0.09727273, true),
  ('GMTS SEWING NEEDLE', 'IN-033', NULL, 'DP X 17', '9', 'ORGAN', 5.800000, 0.05272727, true),
  ('GMTS SEWING NEEDLE', 'IN-034', NULL, 'DP X 17', '11', 'ORGAN', 5.800000, 0.05272727, true),
  ('GMTS SEWING NEEDLE', 'IN-035', NULL, 'DP X 17', '14', 'ORGAN', 7.300000, 0.06636364, true),
  ('GMTS SEWING NEEDLE', 'IN-036', NULL, 'DV X 57', '11', 'ORGAN', 7.300000, 0.06636364, true),
  ('GMTS SEWING NEEDLE', 'IN-037', NULL, 'DV X 57', '14', 'ORGAN', 11.300000, 0.10272727, true),
  ('GMTS SEWING NEEDLE', 'IN-038', NULL, 'FLX 118-GCS', '9', 'ORGAN', 35.000000, 0.31818182, true),
  ('GMTS SEWING NEEDLE', 'IN-039', NULL, 'FLX 118-GCS', '11', 'ORGAN', 25.048000, 0.22770909, true),
  ('GMTS SEWING NEEDLE', 'IN-040', NULL, 'SM X 1014', '10', 'ORGAN', 33.000000, 0.30000000, true),
  ('GMTS SEWING NEEDLE', 'IN-041', NULL, 'LW X 1669E', '12', 'ORGAN', 33.550000, 0.30500000, true);

INSERT INTO public.idle_needle_floor_assignments(needle_item_id, floor_id)
SELECT needle.id, floor.id FROM public.idle_needle_items AS needle
CROSS JOIN public.floors AS floor WHERE floor.active = true;

NOTIFY pgrst, 'reload schema';

SELECT 'normal' AS catalog, count(*) AS items,
       (SELECT count(*) FROM public.normal_needle_floor_assignments) AS floor_assignments
FROM public.normal_needle_items
UNION ALL
SELECT 'idle', count(*), (SELECT count(*) FROM public.idle_needle_floor_assignments)
FROM public.idle_needle_items;

COMMIT;
