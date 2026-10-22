-- =============================================================================
-- Migration: 20241001000006_profile_floor_ids.sql
-- Adds multi-floor assignments to existing and new ERP databases.
-- Safe to rerun. Preserves existing assignments and does not change accounts.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS floor_ids UUID[] NOT NULL DEFAULT '{}'::UUID[];

-- Retain the original single-floor assignment when upgrading older profiles.
-- Also repair a nullable floor_ids column from an earlier manual migration.
UPDATE public.profiles
SET floor_ids = CASE
  WHEN floor_id IS NOT NULL THEN ARRAY[floor_id]
  ELSE '{}'::UUID[]
END
WHERE floor_ids IS NULL
   OR (cardinality(floor_ids) = 0 AND floor_id IS NOT NULL);

ALTER TABLE public.profiles
  ALTER COLUMN floor_ids SET DEFAULT '{}'::UUID[],
  ALTER COLUMN floor_ids SET NOT NULL;

COMMENT ON COLUMN public.profiles.floor_ids IS
  'Array of assigned floor UUIDs supporting multi-floor personnel.';

CREATE INDEX IF NOT EXISTS idx_profiles_floor_ids
  ON public.profiles USING GIN (floor_ids);

NOTIFY pgrst, 'reload schema';
