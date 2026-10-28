-- =============================================================================
-- Migration: 20261028000001_system_settings.sql
-- Description: System Settings table for central application configuration.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_settings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key   TEXT NOT NULL,
  setting_value TEXT NOT NULL DEFAULT '',
  setting_type  TEXT NOT NULL DEFAULT 'string',
  section       TEXT NOT NULL DEFAULT 'general',
  label         TEXT NULL,
  description   TEXT NULL,
  updated_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_system_settings_key UNIQUE (setting_key)
);

CREATE INDEX IF NOT EXISTS idx_system_settings_key ON public.system_settings (setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_section ON public.system_settings (section);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_system_settings_updated_at') THEN
    CREATE TRIGGER trg_system_settings_updated_at
      BEFORE UPDATE ON public.system_settings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'service_role_all_system_settings') THEN
    CREATE POLICY service_role_all_system_settings ON public.system_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'authenticated_read_system_settings') THEN
    CREATE POLICY authenticated_read_system_settings ON public.system_settings FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'system_settings' AND policyname = 'authenticated_write_system_settings') THEN
    CREATE POLICY authenticated_write_system_settings ON public.system_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.system_settings TO service_role;
GRANT ALL ON public.system_settings TO authenticated;

-- Seed Initial Daily Report Settings
INSERT INTO public.system_settings (setting_key, setting_value, setting_type, section, label, description)
VALUES
  ('daily_report.document_no', 'QA/03/310', 'string', 'daily_report', 'Document No.', 'Document identification number for Daily Sewing Needle Present Balance reports'),
  ('daily_report.version_no', '01/2026', 'string', 'daily_report', 'Version No.', 'Document version number for Daily Sewing Needle Present Balance reports')
ON CONFLICT (setting_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description;
