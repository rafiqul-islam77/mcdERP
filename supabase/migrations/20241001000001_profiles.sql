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