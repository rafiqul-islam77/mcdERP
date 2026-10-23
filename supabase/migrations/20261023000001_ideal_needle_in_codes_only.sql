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
