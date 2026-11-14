-- Correct ONLY two records from the November opening-stock import:
-- A Floor / RUNNING / SN-107: 793 -> 493
-- A Floor / RUNNING / SN-203: 208 -> 108
-- Run the entire file in Supabase SQL Editor. Safe to rerun.
-- Matches exact imported IDs plus floor, item, type, date and source provenance.
-- Dates, other transactions, BNR and catalogs are unchanged.
-- If these opening records are already correct, this performs no updates.
-- It does NOT force a current stock balance: later transactions still contribute.

BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.floors, public.normal_needle_items IN SHARE MODE;
LOCK TABLE public.needle_running_transactions IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE opening_quantity_fix (
  transaction_id UUID PRIMARY KEY,
  item_code TEXT NOT NULL,
  old_quantity NUMERIC NOT NULL,
  new_quantity NUMERIC NOT NULL
) ON COMMIT DROP;

INSERT INTO opening_quantity_fix VALUES
  ('43f24d6e-be32-57ab-824f-3283829035f6', 'SN-107', 793, 493),
  ('0da8b3bb-b98b-5aed-a58e-5bd77dc13d33', 'SN-203', 208, 108);

DO $$
DECLARE matched INTEGER;
BEGIN
  SELECT count(*) INTO matched
  FROM opening_quantity_fix s
  JOIN public.needle_running_transactions t ON t.id = s.transaction_id
  JOIN public.floors f ON f.id = t.floor_id AND f.code = 'FL-A'
  JOIN public.normal_needle_items n ON n.id = t.needle_item_id AND n.item_code = s.item_code
  WHERE t.transaction_type = 'OPENING'
    AND t.transaction_date IN (DATE '2026-10-31', DATE '2026-11-01')
    AND t.notes LIKE 'Opening stock import 2026-11-01; STOCK -31-10-2026.xlsx; %'
    AND t.quantity IN (s.old_quantity, s.new_quantity);
  IF matched <> 2 THEN
    RAISE EXCEPTION 'The two November opening records do not match the expected floor, item, date, source or quantity. Nothing changed. Inspect these records before correcting other transactions.';
  END IF;
END $$;

UPDATE public.needle_running_transactions t
SET quantity = s.new_quantity
FROM opening_quantity_fix s
WHERE t.id = s.transaction_id AND t.quantity = s.old_quantity;

SELECT 'A Floor' AS floor, 'RUNNING' AS category, s.item_code,
       t.transaction_date, t.quantity AS opening_quantity
FROM opening_quantity_fix s
JOIN public.needle_running_transactions t ON t.id = s.transaction_id
ORDER BY s.item_code;

COMMIT;
