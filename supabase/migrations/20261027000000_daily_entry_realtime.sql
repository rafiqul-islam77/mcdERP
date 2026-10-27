-- =============================================================================
-- Migration: 20261027000000_daily_entry_realtime.sql
-- Description: Enable Supabase Realtime & REPLICA IDENTITY FULL for Daily Entry
-- Tables:
--   - needle_daily_sheets
--   - needle_running_transactions
--   - needle_new_transactions
--   - needle_idle_transactions
--   - needle_bnr_records
-- =============================================================================

BEGIN;

-- 1. Enable REPLICA IDENTITY FULL so UPDATE and DELETE events include full row payloads
ALTER TABLE public.needle_daily_sheets REPLICA IDENTITY FULL;
ALTER TABLE public.needle_running_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.needle_new_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.needle_idle_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.needle_bnr_records REPLICA IDENTITY FULL;

-- 2. Add tables to supabase_realtime publication idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'needle_daily_sheets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.needle_daily_sheets;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'needle_running_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.needle_running_transactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'needle_new_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.needle_new_transactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'needle_idle_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.needle_idle_transactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'needle_bnr_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.needle_bnr_records;
  END IF;
END $$;

COMMIT;
