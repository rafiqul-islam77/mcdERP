-- =============================================================================
-- Migration: 20261024000000_needle_floor_entry_type.sql
-- Description: Split Normal Needle floor assignments into NEW and RUNNING categories.
-- =============================================================================

BEGIN;

-- 1. Add entry_type column to normal_needle_floor_assignments
ALTER TABLE public.normal_needle_floor_assignments
  ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'new'
    CHECK (entry_type IN ('new', 'running'));

-- 2. Drop old unique constraint on (needle_item_id, floor_id)
ALTER TABLE public.normal_needle_floor_assignments
  DROP CONSTRAINT IF EXISTS normal_needle_floor_assignments_needle_item_id_floor_id_key;

ALTER TABLE public.normal_needle_floor_assignments
  DROP CONSTRAINT IF EXISTS uq_normal_needle_floor_entry;

-- 3. Add new unique constraint on (needle_item_id, floor_id, entry_type)
ALTER TABLE public.normal_needle_floor_assignments
  ADD CONSTRAINT uq_normal_needle_floor_entry
    UNIQUE (needle_item_id, floor_id, entry_type);

-- 4. Duplicate existing assignments into 'running' so existing assignments are active for both NEW and RUNNING
INSERT INTO public.normal_needle_floor_assignments (needle_item_id, floor_id, entry_type)
SELECT needle_item_id, floor_id, 'running'
FROM public.normal_needle_floor_assignments
WHERE entry_type = 'new'
ON CONFLICT (needle_item_id, floor_id, entry_type) DO NOTHING;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_nnfa_entry_type
  ON public.normal_needle_floor_assignments (entry_type);

CREATE INDEX IF NOT EXISTS idx_nnfa_item_entry
  ON public.normal_needle_floor_assignments (needle_item_id, entry_type);

-- 6. Update set_normal_needle_floors RPC to support p_entry_type
CREATE OR REPLACE FUNCTION public.set_normal_needle_floors(
  p_item_id UUID,
  p_floor_ids UUID[],
  p_entry_type TEXT DEFAULT 'new'
)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1 FROM public.normal_needle_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Needle does not exist in the normal catalog.';
  END IF;

  DELETE FROM public.normal_needle_floor_assignments
  WHERE needle_item_id = p_item_id
    AND entry_type = coalesce(p_entry_type, 'new');

  INSERT INTO public.normal_needle_floor_assignments(needle_item_id, floor_id, entry_type)
  SELECT p_item_id, floor_id, coalesce(p_entry_type, 'new')
  FROM (SELECT DISTINCT unnest(coalesce(p_floor_ids, '{}'::UUID[])) AS floor_id) AS chosen;
END;
$$;

REVOKE ALL ON FUNCTION public.set_normal_needle_floors(UUID, UUID[], TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_normal_needle_floors(UUID, UUID[], TEXT) TO service_role;

-- 7. Update needle_floor_assignments if table exists (for fallback compatibility)
DO $$
BEGIN
  IF to_regclass('public.needle_floor_assignments') IS NOT NULL THEN
    ALTER TABLE public.needle_floor_assignments
      ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'new'
        CHECK (entry_type IN ('new', 'running'));

    ALTER TABLE public.needle_floor_assignments
      DROP CONSTRAINT IF EXISTS uq_needle_floor_group;

    ALTER TABLE public.needle_floor_assignments
      DROP CONSTRAINT IF EXISTS uq_needle_floor_group_entry;

    ALTER TABLE public.needle_floor_assignments
      ADD CONSTRAINT uq_needle_floor_group_entry
        UNIQUE (needle_item_id, floor_id, needle_group, entry_type);

    INSERT INTO public.needle_floor_assignments (needle_item_id, floor_id, needle_group, entry_type)
    SELECT needle_item_id, floor_id, needle_group, 'running'
    FROM public.needle_floor_assignments
    WHERE entry_type = 'new' AND needle_group = 'needle'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMIT;
