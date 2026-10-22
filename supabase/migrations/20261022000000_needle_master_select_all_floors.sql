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
