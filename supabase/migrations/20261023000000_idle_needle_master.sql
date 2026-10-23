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
