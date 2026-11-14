-- Correct the cause of the inflated 1-Nov PREV balances, identified in Supabase:
-- SN-107: opening 493 + receipt 300 = 793; correct PREV is 493.
-- SN-203: opening 108 + receipt 100 = 208; correct PREV is 108.
-- Zero ONLY these two 31-Oct RECEIVE quantities; retain the records for traceability.
-- Opening records, dates, BNR, other items/floors/categories and all later entries
-- remain unchanged. Later calculated balances for these two items also decrease
-- by 300 and 100 respectively, because they carry this corrected stock forward.
-- Run the ENTIRE file in Supabase SQL Editor, then refresh Daily Entry online.
-- Safe to rerun: already-zero quantities are left untouched.

BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.floors, public.normal_needle_items IN SHARE MODE;
LOCK TABLE public.needle_running_transactions IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE receipt_quantity_fix (
  transaction_id UUID PRIMARY KEY,
  item_code TEXT NOT NULL,
  incorrect_quantity NUMERIC NOT NULL
) ON COMMIT DROP;
INSERT INTO receipt_quantity_fix VALUES
  ('8666ca4b-be67-42f8-b545-9de0e46cf1e7', 'SN-107', 300),
  ('f7182462-4747-4742-8389-8e436477c6bd', 'SN-203', 100);

DO $$
DECLARE matched INTEGER;
BEGIN
  SELECT count(*) INTO matched
  FROM receipt_quantity_fix s
  JOIN public.needle_running_transactions t ON t.id = s.transaction_id
  JOIN public.floors f ON f.id = t.floor_id AND f.code = 'FL-A'
  JOIN public.normal_needle_items n ON n.id = t.needle_item_id AND n.item_code = s.item_code
  WHERE t.transaction_date = DATE '2026-10-31'
    AND t.transaction_type = 'RECEIVE'
    AND t.quantity IN (s.incorrect_quantity, 0);
  IF matched <> 2 THEN
    RAISE EXCEPTION 'The two specific A Floor RUNNING receipts do not match the expected date, item or quantity. Nothing changed.';
  END IF;
END $$;

UPDATE public.needle_running_transactions t SET quantity = 0
FROM receipt_quantity_fix s
WHERE t.id = s.transaction_id AND t.quantity = s.incorrect_quantity;

-- Recalculate the actual 1-Nov PREV, including every earlier movement.
SELECT f.code AS floor, 'RUNNING' AS category, n.item_code,
       sum(CASE
         WHEN t.transaction_type IN ('OPENING','RECEIVE','TRANSFER_IN','ADJUSTMENT_IN') THEN t.quantity
         WHEN t.transaction_type IN ('ISSUE','TRANSFER_OUT','ADJUSTMENT_OUT') THEN -t.quantity
         ELSE 0 END) AS previous_balance_on_20261101
FROM public.needle_running_transactions t
JOIN public.floors f ON f.id = t.floor_id
JOIN public.normal_needle_items n ON n.id = t.needle_item_id
WHERE f.code = 'FL-A' AND n.item_code IN ('SN-107','SN-203')
  AND t.transaction_date < DATE '2026-11-01'
GROUP BY f.code, n.item_code ORDER BY n.item_code;

COMMIT;
