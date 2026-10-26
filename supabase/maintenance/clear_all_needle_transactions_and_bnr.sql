-- Manual maintenance: clear ALL needle transactions and BNR records.
-- Run the entire file in Supabase SQL Editor as the database owner (postgres).
-- Kept outside migrations so future deployments do not automatically erase data.
--
-- Clears every floor and date: NEW, RUNNING, IDLE, BNR, and daily-sheet headers
-- (including requisition numbers). All ledger-derived stock balances become zero.
-- Preserves table definitions, needle catalogs, floor assignments, floors, users,
-- roles, permissions, and audit history.
--
-- Before running: stop entry/sync activity on all devices. Discard old offline
-- drafts and pending operations by deleting the browser IndexedDB database
-- mcd_erp_daily_entry_v1 on each device before reopening the app. This also removes
-- cached stock/sheets; the app rebuilds caches when online. SQL cannot clear these.
-- Deletion is permanent after COMMIT. Export needed records before running.
-- Rerunning this file clears any newly entered records too.

BEGIN;

-- Fail promptly if another session is using these tables. A failure rolls back
-- the whole reset. No CASCADE: unexpected referencing tables cause an error
-- instead of silently deleting records outside the intended scope.
SET LOCAL lock_timeout = '10s';

TRUNCATE TABLE
  public.needle_new_transactions,
  public.needle_running_transactions,
  public.needle_idle_transactions,
  public.needle_bnr_records,
  public.needle_daily_sheets
CONTINUE IDENTITY RESTRICT;

-- Every result must show zero remaining records.
SELECT 'needle_new_transactions' AS table_name, count(*) AS remaining_records
FROM public.needle_new_transactions
UNION ALL
SELECT 'needle_running_transactions', count(*) FROM public.needle_running_transactions
UNION ALL
SELECT 'needle_idle_transactions', count(*) FROM public.needle_idle_transactions
UNION ALL
SELECT 'needle_bnr_records', count(*) FROM public.needle_bnr_records
UNION ALL
SELECT 'needle_daily_sheets', count(*) FROM public.needle_daily_sheets;

COMMIT;
