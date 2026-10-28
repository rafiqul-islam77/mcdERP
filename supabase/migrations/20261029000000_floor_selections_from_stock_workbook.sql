-- Source: STOCK -27-10-2026.xlsx, sheets RUNNING+NEW, IDLE.
-- Source SHA256: a387bda6ded8edc2290b80786b109513b142351a159711adcf35ebb2e0c43858
-- Generated 2026-10-29. Run the ENTIRE file in Supabase SQL Editor.
-- Select all listed item codes regardless of stock quantity; exclude subtotal rows.
-- Requires the separate normal/idle catalogs and entry_type migration
-- (20261023000002_reset_separate_needle_catalogs.sql and
--  20261024000000_needle_floor_entry_type.sql) to have already been applied.
-- Exact replacement on the 14 mapped floors: unlisted item selections are removed.
-- IDLE EMB is cleared explicitly at the user's request because it is absent in IDLE.
-- Floors outside this mapping, item master data and daily transactions are unchanged.
-- Expected selections: NEW 184, RUNNING 351, IDLE 62.
-- Atomic and repeat-safe. Missing database item/floor codes abort before mutations.

BEGIN;

-- Keep the validated mapping stable and prevent concurrent assignment edits.
LOCK TABLE public.floors, public.normal_needle_items, public.idle_needle_items IN SHARE MODE;
LOCK TABLE public.normal_needle_floor_assignments,
           public.idle_needle_floor_assignments IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE floor_selection_source (
  category text NOT NULL CHECK (category IN ('new', 'running', 'idle')),
  floor_code text NOT NULL,
  item_codes text[] NOT NULL,
  PRIMARY KEY (category, floor_code)
) ON COMMIT DROP;

INSERT INTO floor_selection_source (category, floor_code, item_codes) VALUES
  ('new', 'FL-A', ARRAY['SN-013', 'SN-029', 'SN-056', 'SN-065', 'SN-094', 'SN-107', 'SN-126', 'SN-147', 'SN-163', 'SN-175', 'SN-183', 'SN-195', 'SN-203', 'SN-261', 'SN-289', 'SN-308', 'SN-320']::text[]),
  ('new', 'FL-B', ARRAY['SN-013', 'SN-029', 'SN-043', 'SN-056', 'SN-065', 'SN-092', 'SN-107', 'SN-126', 'SN-163', 'SN-175', 'SN-183', 'SN-184', 'SN-195', 'SN-203', 'SN-212', 'SN-223', 'SN-261', 'SN-289', 'SN-308']::text[]),
  ('new', 'FL-C', ARRAY['SN-029', 'SN-043', 'SN-056', 'SN-092', 'SN-101', 'SN-107', 'SN-126', 'SN-163', 'SN-175', 'SN-183', 'SN-203', 'SN-220', 'SN-250', 'SN-261', 'SN-289', 'SN-300', 'SN-308']::text[]),
  ('new', 'FL-D', ARRAY['SN-013', 'SN-029', 'SN-056', 'SN-095', 'SN-107', 'SN-126', 'SN-163', 'SN-175', 'SN-183', 'SN-203', 'SN-220', 'SN-222', 'SN-261', 'SN-289', 'SN-308']::text[]),
  ('new', 'FL-E', ARRAY['SN-029', 'SN-107', 'SN-163', 'SN-183', 'SN-203', 'SN-261', 'SN-308']::text[]),
  ('new', 'FL-EMB', ARRAY['SN-003', 'SN-013', 'SN-029', 'SN-056', 'SN-070', 'SN-079', 'SN-082']::text[]),
  ('new', 'FL-F', ARRAY['SN-013', 'SN-029', 'SN-043', 'SN-056', 'SN-065', 'SN-107', 'SN-126', 'SN-163', 'SN-183', 'SN-203', 'SN-220', 'SN-261', 'SN-278', 'SN-308', 'SN-317']::text[]),
  ('new', 'FL-G', ARRAY['SN-013', 'SN-019', 'SN-029', 'SN-043', 'SN-056', 'SN-065', 'SN-071', 'SN-092', 'SN-101', 'SN-107', 'SN-126', 'SN-147', 'SN-163', 'SN-175', 'SN-183', 'SN-203', 'SN-220', 'SN-250', 'SN-261', 'SN-308', 'SN-317', 'SN-334']::text[]),
  ('new', 'FL-H', ARRAY['SN-029', 'SN-043', 'SN-056', 'SN-107', 'SN-126', 'SN-163', 'SN-183', 'SN-203', 'SN-220', 'SN-261', 'SN-308', 'SN-317', 'SN-318']::text[]),
  ('new', 'FL-I', ARRAY['SN-013', 'SN-029', 'SN-043', 'SN-056', 'SN-092', 'SN-107', 'SN-126', 'SN-163', 'SN-183', 'SN-203', 'SN-261', 'SN-308', 'SN-317']::text[]),
  ('new', 'FL-J', ARRAY['SN-029', 'SN-107', 'SN-163', 'SN-183', 'SN-197', 'SN-261', 'SN-289', 'SN-308']::text[]),
  ('new', 'FL-K', ARRAY['SN-029', 'SN-101', 'SN-107', 'SN-156', 'SN-163', 'SN-175', 'SN-183', 'SN-195', 'SN-203', 'SN-206', 'SN-220', 'SN-261', 'SN-289', 'SN-308', 'SN-330', 'SN-334']::text[]),
  ('new', 'FL-SMP', ARRAY['SN-029', 'SN-056', 'SN-107', 'SN-126', 'SN-163', 'SN-203', 'SN-261', 'SN-287', 'SN-308', 'SN-334', 'SN-351']::text[]),
  ('new', 'FL-TC', ARRAY['SN-029', 'SN-107', 'SN-120', 'SN-163']::text[]),
  ('running', 'FL-A', ARRAY['SN-003', 'SN-013', 'SN-019', 'SN-029', 'SN-036', 'SN-043', 'SN-056', 'SN-065', 'SN-084', 'SN-085', 'SN-092', 'SN-095', 'SN-099', 'SN-107', 'SN-113', 'SN-119', 'SN-126', 'SN-147', 'SN-156', 'SN-163', 'SN-171', 'SN-175', 'SN-183', 'SN-195', 'SN-203', 'SN-205', 'SN-212', 'SN-220', 'SN-222', 'SN-261', 'SN-289', 'SN-308', 'SN-318', 'SN-320', 'SN-480', 'SN-481']::text[]),
  ('running', 'FL-B', ARRAY['SN-013', 'SN-029', 'SN-043', 'SN-056', 'SN-065', 'SN-070', 'SN-085', 'SN-092', 'SN-107', 'SN-113', 'SN-119', 'SN-126', 'SN-147', 'SN-161', 'SN-163', 'SN-175', 'SN-183', 'SN-195', 'SN-203', 'SN-220', 'SN-261', 'SN-289', 'SN-308', 'SN-317', 'SN-318', 'SN-320']::text[]),
  ('running', 'FL-C', ARRAY['SN-013', 'SN-014', 'SN-029', 'SN-031', 'SN-043', 'SN-045', 'SN-056', 'SN-058', 'SN-065', 'SN-070', 'SN-092', 'SN-101', 'SN-107', 'SN-113', 'SN-126', 'SN-133', 'SN-140', 'SN-147', 'SN-163', 'SN-169', 'SN-175', 'SN-176', 'SN-183', 'SN-195', 'SN-203', 'SN-206', 'SN-220', 'SN-222', 'SN-231', 'SN-248', 'SN-261', 'SN-289', 'SN-308']::text[]),
  ('running', 'FL-D', ARRAY['SN-003', 'SN-013', 'SN-029', 'SN-031', 'SN-043', 'SN-056', 'SN-058', 'SN-065', 'SN-085', 'SN-092', 'SN-107', 'SN-126', 'SN-133', 'SN-147', 'SN-163', 'SN-175', 'SN-183', 'SN-195', 'SN-203', 'SN-220', 'SN-222', 'SN-231', 'SN-261', 'SN-289', 'SN-308']::text[]),
  ('running', 'FL-E', ARRAY['SN-001', 'SN-013', 'SN-029', 'SN-043', 'SN-056', 'SN-085', 'SN-092', 'SN-095', 'SN-107', 'SN-113', 'SN-126', 'SN-140', 'SN-147', 'SN-155', 'SN-156', 'SN-163', 'SN-172', 'SN-175', 'SN-176', 'SN-183', 'SN-194', 'SN-203', 'SN-261']::text[]),
  ('running', 'FL-EMB', ARRAY['SN-003', 'SN-013', 'SN-029', 'SN-056', 'SN-070', 'SN-079', 'SN-082']::text[]),
  ('running', 'FL-F', ARRAY['SN-013', 'SN-029', 'SN-033', 'SN-043', 'SN-056', 'SN-058', 'SN-065', 'SN-070', 'SN-107', 'SN-113', 'SN-132', 'SN-133', 'SN-136', 'SN-163', 'SN-183', 'SN-203', 'SN-206', 'SN-220', 'SN-248', 'SN-261', 'SN-287', 'SN-308', 'SN-317', 'SN-483']::text[]),
  ('running', 'FL-G', ARRAY['SN-001', 'SN-013', 'SN-029', 'SN-043', 'SN-048', 'SN-056', 'SN-065', 'SN-070', 'SN-092', 'SN-101', 'SN-107', 'SN-126', 'SN-136', 'SN-147', 'SN-163', 'SN-175', 'SN-183', 'SN-195', 'SN-203', 'SN-220', 'SN-231', 'SN-248', 'SN-261', 'SN-308', 'SN-317', 'SN-318', 'SN-320']::text[]),
  ('running', 'FL-H', ARRAY['SN-003', 'SN-006', 'SN-013', 'SN-018', 'SN-029', 'SN-031', 'SN-043', 'SN-045', 'SN-056', 'SN-058', 'SN-065', 'SN-070', 'SN-085', 'SN-092', 'SN-107', 'SN-113', 'SN-126', 'SN-163', 'SN-175', 'SN-183', 'SN-203', 'SN-206', 'SN-220', 'SN-225', 'SN-230', 'SN-231', 'SN-261', 'SN-265', 'SN-308', 'SN-317', 'SN-318', 'SN-320', 'SN-479']::text[]),
  ('running', 'FL-I', ARRAY['SN-001', 'SN-013', 'SN-029', 'SN-043', 'SN-045', 'SN-056', 'SN-065', 'SN-085', 'SN-092', 'SN-107', 'SN-126', 'SN-163', 'SN-165', 'SN-175', 'SN-183', 'SN-203', 'SN-220', 'SN-225', 'SN-230', 'SN-231', 'SN-248', 'SN-261', 'SN-265', 'SN-308', 'SN-317', 'SN-318', 'SN-320']::text[]),
  ('running', 'FL-J', ARRAY['SN-001', 'SN-013', 'SN-029', 'SN-031', 'SN-043', 'SN-056', 'SN-085', 'SN-092', 'SN-101', 'SN-107', 'SN-113', 'SN-126', 'SN-140', 'SN-147', 'SN-163', 'SN-175', 'SN-176', 'SN-183', 'SN-195', 'SN-203', 'SN-220', 'SN-261', 'SN-289', 'SN-308', 'SN-332']::text[]),
  ('running', 'FL-K', ARRAY['SN-001', 'SN-013', 'SN-029', 'SN-032', 'SN-043', 'SN-056', 'SN-065', 'SN-085', 'SN-092', 'SN-101', 'SN-107', 'SN-126', 'SN-163', 'SN-175', 'SN-183', 'SN-191', 'SN-195', 'SN-203', 'SN-206', 'SN-220', 'SN-231', 'SN-250', 'SN-261', 'SN-289', 'SN-300', 'SN-308', 'SN-334', 'SN-336', 'SN-339', 'SN-471']::text[]),
  ('running', 'FL-SMP', ARRAY['SN-003', 'SN-029', 'SN-056', 'SN-070', 'SN-085', 'SN-107', 'SN-126', 'SN-140', 'SN-147', 'SN-163', 'SN-175', 'SN-183', 'SN-191', 'SN-203', 'SN-212', 'SN-225', 'SN-248', 'SN-261', 'SN-265', 'SN-277', 'SN-289', 'SN-299', 'SN-308', 'SN-312', 'SN-317', 'SN-320', 'SN-334', 'SN-351']::text[]),
  ('running', 'FL-TC', ARRAY['SN-029', 'SN-043', 'SN-107', 'SN-163', 'SN-183', 'SN-261', 'SN-308']::text[]),
  ('idle', 'FL-A', ARRAY['IN-003', 'IN-009', 'IN-010', 'IN-016', 'IN-017', 'IN-020', 'IN-025', 'IN-031', 'IN-034', 'IN-037']::text[]),
  ('idle', 'FL-B', ARRAY['IN-003', 'IN-004', 'IN-009', 'IN-010', 'IN-017', 'IN-020', 'IN-021']::text[]),
  ('idle', 'FL-C', ARRAY['IN-003', 'IN-010', 'IN-017', 'IN-025']::text[]),
  ('idle', 'FL-D', ARRAY['IN-003', 'IN-010', 'IN-017', 'IN-022']::text[]),
  ('idle', 'FL-E', ARRAY['IN-003', 'IN-010', 'IN-017']::text[]),
  ('idle', 'FL-EMB', ARRAY[]::text[]),
  ('idle', 'FL-F', ARRAY['IN-010', 'IN-021']::text[]),
  ('idle', 'FL-G', ARRAY['IN-003', 'IN-010', 'IN-017', 'IN-022']::text[]),
  ('idle', 'FL-H', ARRAY['IN-003', 'IN-005', 'IN-010', 'IN-020', 'IN-021']::text[]),
  ('idle', 'FL-I', ARRAY['IN-003', 'IN-010']::text[]),
  ('idle', 'FL-J', ARRAY['IN-003', 'IN-010', 'IN-017', 'IN-025', 'IN-030', 'IN-034', 'IN-039']::text[]),
  ('idle', 'FL-K', ARRAY['IN-003', 'IN-010', 'IN-017', 'IN-020', 'IN-025']::text[]),
  ('idle', 'FL-SMP', ARRAY['IN-003', 'IN-010', 'IN-017', 'IN-021', 'IN-024', 'IN-031']::text[]),
  ('idle', 'FL-TC', ARRAY['IN-003', 'IN-010', 'IN-017']::text[]);

CREATE TEMP TABLE desired_floor_selections ON COMMIT DROP AS
SELECT s.category, s.floor_code, code.item_code
FROM floor_selection_source AS s
CROSS JOIN LATERAL unnest(s.item_codes) AS code(item_code);

-- Validate exact database matches before deleting any existing selections.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(s.floor_code, ', ' ORDER BY s.floor_code) INTO missing
  FROM (SELECT DISTINCT floor_code FROM floor_selection_source) AS s
  WHERE NOT EXISTS (SELECT 1 FROM public.floors f WHERE f.code = s.floor_code);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing floor codes: %. No selections changed.', missing;
  END IF;

  SELECT string_agg(s.item_code, ', ' ORDER BY s.item_code) INTO missing
  FROM (SELECT DISTINCT item_code FROM desired_floor_selections WHERE category IN ('new', 'running')) AS s
  WHERE NOT EXISTS (SELECT 1 FROM public.normal_needle_items n WHERE n.item_code = s.item_code);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing normal needle item codes: %. No selections changed.', missing;
  END IF;

  SELECT string_agg(s.item_code, ', ' ORDER BY s.item_code) INTO missing
  FROM (SELECT DISTINCT item_code FROM desired_floor_selections WHERE category = 'idle') AS s
  WHERE NOT EXISTS (SELECT 1 FROM public.idle_needle_items n WHERE n.item_code = s.item_code);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing idle needle item codes: %. No selections changed.', missing;
  END IF;
END $$;

CREATE TEMP TABLE resolved_floor_selections ON COMMIT DROP AS
SELECT s.category, f.id AS floor_id, n.id AS needle_item_id
FROM desired_floor_selections s
JOIN public.floors f ON f.code = s.floor_code
JOIN public.normal_needle_items n ON n.item_code = s.item_code
WHERE s.category IN ('new', 'running')
UNION ALL
SELECT s.category, f.id, n.id
FROM desired_floor_selections s
JOIN public.floors f ON f.code = s.floor_code
JOIN public.idle_needle_items n ON n.item_code = s.item_code
WHERE s.category = 'idle';

-- Remove only assignments absent from the supplied list on the mapped floors.
-- Existing desired assignments retain their IDs and timestamps.
DELETE FROM public.normal_needle_floor_assignments a
USING public.floors f, floor_selection_source s
WHERE a.floor_id = f.id AND f.code = s.floor_code
  AND s.category = a.entry_type AND s.category IN ('new', 'running')
  AND NOT EXISTS (
    SELECT 1 FROM resolved_floor_selections d
    WHERE d.category = a.entry_type AND d.floor_id = a.floor_id
      AND d.needle_item_id = a.needle_item_id
  );

DELETE FROM public.idle_needle_floor_assignments a
USING public.floors f, floor_selection_source s
WHERE a.floor_id = f.id AND f.code = s.floor_code AND s.category = 'idle'
  AND NOT EXISTS (
    SELECT 1 FROM resolved_floor_selections d
    WHERE d.category = 'idle' AND d.floor_id = a.floor_id
      AND d.needle_item_id = a.needle_item_id
  );

INSERT INTO public.normal_needle_floor_assignments (needle_item_id, floor_id, entry_type)
SELECT needle_item_id, floor_id, category
FROM resolved_floor_selections WHERE category IN ('new', 'running')
ON CONFLICT (needle_item_id, floor_id, entry_type) DO NOTHING;

INSERT INTO public.idle_needle_floor_assignments (needle_item_id, floor_id)
SELECT needle_item_id, floor_id FROM resolved_floor_selections WHERE category = 'idle'
ON CONFLICT (needle_item_id, floor_id) DO NOTHING;

CREATE TEMP TABLE actual_floor_selections ON COMMIT DROP AS
SELECT a.entry_type AS category, a.floor_id, a.needle_item_id
FROM public.normal_needle_floor_assignments a
JOIN public.floors f ON f.id = a.floor_id
JOIN floor_selection_source s ON s.floor_code = f.code AND s.category = a.entry_type
UNION ALL
SELECT 'idle', a.floor_id, a.needle_item_id
FROM public.idle_needle_floor_assignments a
JOIN public.floors f ON f.id = a.floor_id
JOIN floor_selection_source s ON s.floor_code = f.code AND s.category = 'idle';

-- Roll back the entire script if either missing or extra selections remain.
DO $$
BEGIN
  IF EXISTS (SELECT * FROM resolved_floor_selections EXCEPT SELECT * FROM actual_floor_selections)
     OR EXISTS (SELECT * FROM actual_floor_selections EXCEPT SELECT * FROM resolved_floor_selections) THEN
    RAISE EXCEPTION 'Floor selection verification failed. All changes rolled back.';
  END IF;
END $$;

-- Result grid: expected_count and actual_count must match for every row.
SELECT upper(s.category) AS category, s.floor_code,
       cardinality(s.item_codes) AS expected_count,
       count(a.needle_item_id) AS actual_count
FROM floor_selection_source s
JOIN public.floors f ON f.code = s.floor_code
LEFT JOIN actual_floor_selections a ON a.category = s.category AND a.floor_id = f.id
GROUP BY s.category, s.floor_code, s.item_codes
ORDER BY CASE s.category WHEN 'new' THEN 1 WHEN 'running' THEN 2 ELSE 3 END, s.floor_code;

COMMIT;
