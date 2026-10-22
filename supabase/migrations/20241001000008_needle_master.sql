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

-- Also seed baseline Ideal Needles across ALL active floors
INSERT INTO public.needle_floor_assignments (needle_item_id, floor_id, needle_group)
SELECT n.id, f.id, 'ideal_needle'
FROM public.needle_items n
CROSS JOIN public.floors f
WHERE f.active = true
ON CONFLICT (needle_item_id, floor_id, needle_group) DO NOTHING;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
