-- =============================================================================
-- Migration: 20241001000007_floor_locations.sql
-- Description: Creates Floor Locations (buildings/premises) master data table,
--              links floors to floor locations (floor_location_id),
--              seeds standard factory buildings and floor mappings,
--              and registers granular permissions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table: floor_locations
-- ---------------------------------------------------------------------------
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

COMMENT ON TABLE  public.floor_locations IS 'Factory premises/buildings containing production floors (e.g. Building 02, Building 6A).';
COMMENT ON COLUMN public.floor_locations.code       IS 'Optional short code for the building, e.g. LOC-B02, BLD-02.';
COMMENT ON COLUMN public.floor_locations.sort_order IS 'Display order in navigation and dropdowns (ascending).';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_floor_locations_active     ON public.floor_locations (active);
CREATE INDEX IF NOT EXISTS idx_floor_locations_sort_order ON public.floor_locations (sort_order);
CREATE INDEX IF NOT EXISTS idx_floor_locations_name       ON public.floor_locations (name);

-- Trigger for updated_at
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

-- Enable RLS
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

-- ---------------------------------------------------------------------------
-- 2. Connect Floor with Floor Location (floor_location_id)
-- ---------------------------------------------------------------------------
ALTER TABLE public.floors
  ADD COLUMN IF NOT EXISTS floor_location_id UUID REFERENCES public.floor_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_floors_floor_location_id
  ON public.floors (floor_location_id);

COMMENT ON COLUMN public.floors.floor_location_id IS
  'Foreign key referencing the parent physical building/location in floor_locations.';

-- ---------------------------------------------------------------------------
-- 3. Seed Master Floor Locations
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4. Connect / Upsert Floors to their Respective Floor Locations
-- ---------------------------------------------------------------------------
-- Building 02: A Floor, B Floor
-- Building 04: C Floor, D Floor
-- Building 03: E Floor
-- Building 01: EMB, Training Centre
-- Building 6A: F Floor, G Floor
-- Building 6B: H Floor, I Floor
-- Building 09: J Floor, K Floor
-- Building 03 (Sample): Sample Floor

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

-- ---------------------------------------------------------------------------
-- 5. Seed Permissions for Floor Locations
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (key, module, page, action, label, description)
VALUES
  ('admin.floor_locations.view',   'admin', 'floor_locations', 'view',   'Floor Locations - View',   'View factory floor locations and buildings'),
  ('admin.floor_locations.create', 'admin', 'floor_locations', 'create', 'Floor Locations - Create', 'Create new factory floor locations and buildings'),
  ('admin.floor_locations.edit',   'admin', 'floor_locations', 'edit',   'Floor Locations - Edit',   'Update factory floor locations and buildings')
ON CONFLICT (key) DO NOTHING;

-- Assign to Site Admin role
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

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
