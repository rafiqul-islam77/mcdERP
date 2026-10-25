-- =============================================================================
-- Migration: 20261025080000_daily_entry_idempotency.sql
-- Description: Phase 2.1 — Add client_operation_id and idempotency constraints
--              to prevent duplicate stock movements on retries/timeouts.
-- Tables:
--   - needle_new_transactions
--   - needle_running_transactions
--   - needle_idle_transactions
--   - needle_bnr_records
-- =============================================================================

BEGIN;

-- 1. Add client_operation_id to needle_new_transactions
ALTER TABLE public.needle_new_transactions
  ADD COLUMN IF NOT EXISTS client_operation_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_nnt_client_op_id
  ON public.needle_new_transactions(client_operation_id)
  WHERE client_operation_id IS NOT NULL;

-- 2. Add client_operation_id to needle_running_transactions
ALTER TABLE public.needle_running_transactions
  ADD COLUMN IF NOT EXISTS client_operation_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_nrt_client_op_id
  ON public.needle_running_transactions(client_operation_id)
  WHERE client_operation_id IS NOT NULL;

-- 3. Add client_operation_id to needle_idle_transactions
ALTER TABLE public.needle_idle_transactions
  ADD COLUMN IF NOT EXISTS client_operation_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_nit_client_op_id
  ON public.needle_idle_transactions(client_operation_id)
  WHERE client_operation_id IS NOT NULL;

-- 4. Add client_operation_id to needle_bnr_records
ALTER TABLE public.needle_bnr_records
  ADD COLUMN IF NOT EXISTS client_operation_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_nbr_client_op_id
  ON public.needle_bnr_records(client_operation_id)
  WHERE client_operation_id IS NOT NULL;

COMMIT;
