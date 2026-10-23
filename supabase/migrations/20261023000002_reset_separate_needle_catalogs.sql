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
