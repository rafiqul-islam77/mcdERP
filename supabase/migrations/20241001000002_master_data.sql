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