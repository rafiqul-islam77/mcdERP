-- Date-only correction for 20261101_import_opening_stock.sql.
-- The app calculates PREV from transactions strictly BEFORE the selected date.
-- Store this opening batch as 31-Oct carry-forward so PREV includes it on 1-Nov.
-- This also changes historical balances for 31-Oct; quantities remain unchanged.
-- Only the identified workbook import is changed, across NEW/RUNNING/IDLE.
-- Run the entire file in Supabase SQL Editor. Safe to rerun.
-- Do not rerun the original import afterwards: its original-date check will fail.
-- After COMMIT, refresh online Daily Entry/stock caches on each device.

BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.needle_new_transactions, public.needle_running_transactions,
           public.needle_idle_transactions IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE opening_date_correction ON COMMIT DROP AS
SELECT 'NEW'::text AS category, id, transaction_date FROM public.needle_new_transactions
WHERE transaction_type = 'OPENING'
  AND notes LIKE 'Opening stock import 2026-11-01; STOCK -31-10-2026.xlsx; %'
UNION ALL
SELECT 'RUNNING', id, transaction_date FROM public.needle_running_transactions
WHERE transaction_type = 'OPENING'
  AND notes LIKE 'Opening stock import 2026-11-01; STOCK -31-10-2026.xlsx; %'
UNION ALL
SELECT 'IDLE', id, transaction_date FROM public.needle_idle_transactions
WHERE transaction_type = 'OPENING'
  AND notes LIKE 'Opening stock import 2026-11-01; STOCK -31-10-2026.xlsx; %';

DO $$
BEGIN
  IF (SELECT count(*) FROM opening_date_correction WHERE category = 'NEW') <> 185
     OR (SELECT count(*) FROM opening_date_correction WHERE category = 'RUNNING') <> 363
     OR (SELECT count(*) FROM opening_date_correction WHERE category = 'IDLE') <> 62 THEN
    RAISE EXCEPTION 'Expected the complete 610-row November opening import. Nothing changed; check which import was applied.';
  END IF;
  IF EXISTS (SELECT 1 FROM opening_date_correction
             WHERE transaction_date NOT IN (DATE '2026-11-01', DATE '2026-10-31')) THEN
    RAISE EXCEPTION 'Some imported records have an unexpected date. Nothing changed.';
  END IF;
END $$;

UPDATE public.needle_new_transactions t SET transaction_date = DATE '2026-10-31'
FROM opening_date_correction s
WHERE s.category = 'NEW' AND t.id = s.id AND t.transaction_date = DATE '2026-11-01';

UPDATE public.needle_running_transactions t SET transaction_date = DATE '2026-10-31'
FROM opening_date_correction s
WHERE s.category = 'RUNNING' AND t.id = s.id AND t.transaction_date = DATE '2026-11-01';

UPDATE public.needle_idle_transactions t SET transaction_date = DATE '2026-10-31'
FROM opening_date_correction s
WHERE s.category = 'IDLE' AND t.id = s.id AND t.transaction_date = DATE '2026-11-01';

SELECT category, count(*) AS matched_records,
       count(*) FILTER (WHERE transaction_date = DATE '2026-11-01') AS dates_corrected,
       DATE '2026-10-31' AS stored_transaction_date,
       DATE '2026-11-01' AS opening_available_on
FROM opening_date_correction GROUP BY category ORDER BY category;

COMMIT;
