-- =============================================================================
-- Migration: 20261125000000_dashboard_general_settings.sql
-- Description:
--   1. Enforce server-side/service-role write control on public.system_settings
--      so non-admin authenticated users cannot bypass permission checks via direct client writes.
--   2. Enable Supabase Realtime on public.system_settings for automatic Dashboard KPI updates.
-- =============================================================================

BEGIN;

-- 1. Restrict direct client writes on system_settings (all writes go through permission-checked server actions via service_role)
DROP POLICY IF EXISTS authenticated_write_system_settings ON public.system_settings;

-- 2. Enable REPLICA IDENTITY FULL and add system_settings to supabase_realtime publication idempotently
ALTER TABLE public.system_settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
  END IF;
END $$;

COMMIT;
