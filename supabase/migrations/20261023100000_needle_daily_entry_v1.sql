-- =============================================================================
-- Migration: 20261023100000_needle_daily_entry_v1.sql
-- Description: Phase 2.1 — Needle Daily Entry System
-- Tables:
--   - needle_daily_sheets: header session per date + floor + category
--   - needle_new_transactions: ledger for NEW needle stock (references normal_needle_items)
--   - needle_running_transactions: ledger for RUNNING needle stock (references normal_needle_items)
--   - needle_idle_transactions: ledger for IDLE needle stock (references idle_needle_items)
--   - needle_bnr_records: Broken Needle Record quantity (no stock effect)
-- RPCs:
--   - transfer_needle_stock_atomic: atomic floor-to-floor stock transfer
--   - calculate_needle_stock_balance: ledger previous and present balance helper
-- Permissions:
--   - needle.daily_entry.running, needle.daily_entry.new, needle.daily_entry.idle
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Table: needle_daily_sheets (Daily session header)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.needle_daily_sheets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date  DATE NOT NULL,
  floor_id    UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('NEW', 'RUNNING', 'IDLE')),
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'closed')),
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_needle_daily_sheets_session UNIQUE (entry_date, floor_id, category)
);

CREATE INDEX IF NOT EXISTS idx_nds_date_floor_cat ON public.needle_daily_sheets(entry_date, floor_id, category);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_needle_daily_sheets_updated_at') THEN
    CREATE TRIGGER trg_needle_daily_sheets_updated_at
      BEFORE UPDATE ON public.needle_daily_sheets
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.needle_daily_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_nds ON public.needle_daily_sheets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read_nds ON public.needle_daily_sheets FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_nds ON public.needle_daily_sheets FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.needle_daily_sheets TO service_role;
GRANT ALL ON public.needle_daily_sheets TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Table: needle_new_transactions (NEW stock ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.needle_new_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date  DATE NOT NULL,
  floor_id          UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  needle_item_id    UUID NOT NULL REFERENCES public.normal_needle_items(id) ON DELETE RESTRICT,
  transaction_type  TEXT NOT NULL CHECK (transaction_type IN ('OPENING','RECEIVE','ISSUE','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT')),
  quantity          NUMERIC(12,2) NOT NULL CHECK (quantity >= 0),
  req_no            TEXT,
  daily_sheet_id    UUID REFERENCES public.needle_daily_sheets(id) ON DELETE SET NULL,
  notes             TEXT,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nnt_floor_date ON public.needle_new_transactions(floor_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_nnt_needle_item ON public.needle_new_transactions(needle_item_id);
CREATE INDEX IF NOT EXISTS idx_nnt_sheet ON public.needle_new_transactions(daily_sheet_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_needle_new_transactions_updated_at') THEN
    CREATE TRIGGER trg_needle_new_transactions_updated_at
      BEFORE UPDATE ON public.needle_new_transactions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.needle_new_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_nnt ON public.needle_new_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read_nnt ON public.needle_new_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_nnt ON public.needle_new_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.needle_new_transactions TO service_role;
GRANT ALL ON public.needle_new_transactions TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Table: needle_running_transactions (RUNNING stock ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.needle_running_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date  DATE NOT NULL,
  floor_id          UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  needle_item_id    UUID NOT NULL REFERENCES public.normal_needle_items(id) ON DELETE RESTRICT,
  transaction_type  TEXT NOT NULL CHECK (transaction_type IN ('OPENING','RECEIVE','ISSUE','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT')),
  quantity          NUMERIC(12,2) NOT NULL CHECK (quantity >= 0),
  req_no            TEXT,
  daily_sheet_id    UUID REFERENCES public.needle_daily_sheets(id) ON DELETE SET NULL,
  notes             TEXT,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nrt_floor_date ON public.needle_running_transactions(floor_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_nrt_needle_item ON public.needle_running_transactions(needle_item_id);
CREATE INDEX IF NOT EXISTS idx_nrt_sheet ON public.needle_running_transactions(daily_sheet_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_needle_running_transactions_updated_at') THEN
    CREATE TRIGGER trg_needle_running_transactions_updated_at
      BEFORE UPDATE ON public.needle_running_transactions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.needle_running_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_nrt ON public.needle_running_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read_nrt ON public.needle_running_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_nrt ON public.needle_running_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.needle_running_transactions TO service_role;
GRANT ALL ON public.needle_running_transactions TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Table: needle_idle_transactions (IDLE stock ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.needle_idle_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date  DATE NOT NULL,
  floor_id          UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  needle_item_id    UUID NOT NULL REFERENCES public.idle_needle_items(id) ON DELETE RESTRICT,
  transaction_type  TEXT NOT NULL CHECK (transaction_type IN ('OPENING','RECEIVE','ISSUE','TRANSFER_IN','TRANSFER_OUT','ADJUSTMENT_IN','ADJUSTMENT_OUT')),
  quantity          NUMERIC(12,2) NOT NULL CHECK (quantity >= 0),
  req_no            TEXT,
  daily_sheet_id    UUID REFERENCES public.needle_daily_sheets(id) ON DELETE SET NULL,
  notes             TEXT,
  created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nit_floor_date ON public.needle_idle_transactions(floor_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_nit_needle_item ON public.needle_idle_transactions(needle_item_id);
CREATE INDEX IF NOT EXISTS idx_nit_sheet ON public.needle_idle_transactions(daily_sheet_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_needle_idle_transactions_updated_at') THEN
    CREATE TRIGGER trg_needle_idle_transactions_updated_at
      BEFORE UPDATE ON public.needle_idle_transactions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.needle_idle_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_nit ON public.needle_idle_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read_nit ON public.needle_idle_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_nit ON public.needle_idle_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.needle_idle_transactions TO service_role;
GRANT ALL ON public.needle_idle_transactions TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Table: needle_bnr_records (Broken Needle Record)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.needle_bnr_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_date     DATE NOT NULL,
  daily_sheet_id  UUID REFERENCES public.needle_daily_sheets(id) ON DELETE SET NULL,
  floor_id        UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  needle_item_id  UUID NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('NEW', 'RUNNING', 'IDLE')),
  quantity        NUMERIC(12,2) NOT NULL CHECK (quantity >= 0),
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_needle_bnr_entry UNIQUE (record_date, floor_id, needle_item_id, category)
);

CREATE INDEX IF NOT EXISTS idx_nbr_date_floor ON public.needle_bnr_records(record_date, floor_id, category);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_needle_bnr_records_updated_at') THEN
    CREATE TRIGGER trg_needle_bnr_records_updated_at
      BEFORE UPDATE ON public.needle_bnr_records
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

ALTER TABLE public.needle_bnr_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_nbr ON public.needle_bnr_records FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read_nbr ON public.needle_bnr_records FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_write_nbr ON public.needle_bnr_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT ALL ON public.needle_bnr_records TO service_role;
GRANT ALL ON public.needle_bnr_records TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Permissions Registration
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (key, module, page, action, label, description)
VALUES
  ('needle.daily_entry.running', 'needle', 'daily_entry', 'running', 'Daily Entry - Running Category', 'Permission to enter running needle daily transactions'),
  ('needle.daily_entry.new',     'needle', 'daily_entry', 'new',     'Daily Entry - New Category',     'Permission to enter new needle daily transactions'),
  ('needle.daily_entry.idle',    'needle', 'daily_entry', 'idle',    'Daily Entry - Idle Category',    'Permission to enter idle needle daily transactions')
ON CONFLICT (key) DO NOTHING;

-- Grant to Site Admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Site Admin'
  AND p.key IN ('needle.daily_entry.running', 'needle.daily_entry.new', 'needle.daily_entry.idle')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Atomic Floor-to-Floor Transfer Function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_needle_stock_atomic(
  p_category          TEXT,
  p_from_floor_id     UUID,
  p_to_floor_id       UUID,
  p_needle_item_id    UUID,
  p_quantity          NUMERIC,
  p_transaction_date  DATE,
  p_req_no            TEXT,
  p_receiver_name     TEXT,
  p_actor_id          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_table             TEXT;
  v_current_stock     NUMERIC := 0;
  v_out_id            UUID;
  v_in_id             UUID;
  v_from_floor_name   TEXT;
  v_to_floor_name     TEXT;
BEGIN
  -- Basic validation
  IF p_from_floor_id = p_to_floor_id THEN
    RAISE EXCEPTION 'Source and destination floors must be different.';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be greater than zero.';
  END IF;

  -- Ensure floors exist and are active
  SELECT name INTO v_from_floor_name FROM public.floors WHERE id = p_from_floor_id AND active = true;
  IF v_from_floor_name IS NULL THEN
    RAISE EXCEPTION 'Source floor is invalid or inactive.';
  END IF;

  SELECT name INTO v_to_floor_name FROM public.floors WHERE id = p_to_floor_id AND active = true;
  IF v_to_floor_name IS NULL THEN
    RAISE EXCEPTION 'Destination floor is invalid or inactive.';
  END IF;

  -- Select target transaction table
  IF p_category = 'NEW' THEN
    v_table := 'needle_new_transactions';
    IF NOT EXISTS (SELECT 1 FROM public.normal_needle_items WHERE id = p_needle_item_id) THEN
      RAISE EXCEPTION 'Needle item not found in normal catalog.';
    END IF;
  ELSIF p_category = 'RUNNING' THEN
    v_table := 'needle_running_transactions';
    IF NOT EXISTS (SELECT 1 FROM public.normal_needle_items WHERE id = p_needle_item_id) THEN
      RAISE EXCEPTION 'Needle item not found in normal catalog.';
    END IF;
  ELSIF p_category = 'IDLE' THEN
    v_table := 'needle_idle_transactions';
    IF NOT EXISTS (SELECT 1 FROM public.idle_needle_items WHERE id = p_needle_item_id) THEN
      RAISE EXCEPTION 'Needle item not found in idle catalog.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid category: %', p_category;
  END IF;

  -- Calculate current present stock on source floor up to transaction date
  IF p_category = 'NEW' THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN transaction_type IN ('OPENING', 'RECEIVE', 'TRANSFER_IN', 'ADJUSTMENT_IN') THEN quantity
        WHEN transaction_type IN ('ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT') THEN -quantity
        ELSE 0
      END
    ), 0)
    INTO v_current_stock
    FROM public.needle_new_transactions
    WHERE floor_id = p_from_floor_id
      AND needle_item_id = p_needle_item_id
      AND transaction_date <= p_transaction_date;
  ELSIF p_category = 'RUNNING' THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN transaction_type IN ('OPENING', 'RECEIVE', 'TRANSFER_IN', 'ADJUSTMENT_IN') THEN quantity
        WHEN transaction_type IN ('ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT') THEN -quantity
        ELSE 0
      END
    ), 0)
    INTO v_current_stock
    FROM public.needle_running_transactions
    WHERE floor_id = p_from_floor_id
      AND needle_item_id = p_needle_item_id
      AND transaction_date <= p_transaction_date;
  ELSE
    SELECT COALESCE(SUM(
      CASE
        WHEN transaction_type IN ('OPENING', 'RECEIVE', 'TRANSFER_IN', 'ADJUSTMENT_IN') THEN quantity
        WHEN transaction_type IN ('ISSUE', 'TRANSFER_OUT', 'ADJUSTMENT_OUT') THEN -quantity
        ELSE 0
      END
    ), 0)
    INTO v_current_stock
    FROM public.needle_idle_transactions
    WHERE floor_id = p_from_floor_id
      AND needle_item_id = p_needle_item_id
      AND transaction_date <= p_transaction_date;
  END IF;

  IF v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'Transfer rejected: requested quantity (%) exceeds available stock (%) on %.',
      p_quantity, v_current_stock, v_from_floor_name;
  END IF;

  -- Atomic INSERT: TRANSFER_OUT on source floor
  IF p_category = 'NEW' THEN
    INSERT INTO public.needle_new_transactions (
      transaction_date, floor_id, needle_item_id, transaction_type, quantity,
      req_no, notes, created_by, updated_by
    ) VALUES (
      p_transaction_date, p_from_floor_id, p_needle_item_id, 'TRANSFER_OUT', p_quantity,
      p_req_no, 'To: ' || v_to_floor_name || ' | Receiver: ' || COALESCE(p_receiver_name, 'N/A'),
      p_actor_id, p_actor_id
    ) RETURNING id INTO v_out_id;

    INSERT INTO public.needle_new_transactions (
      transaction_date, floor_id, needle_item_id, transaction_type, quantity,
      req_no, notes, created_by, updated_by
    ) VALUES (
      p_transaction_date, p_to_floor_id, p_needle_item_id, 'TRANSFER_IN', p_quantity,
      p_req_no, 'From: ' || v_from_floor_name || ' | Receiver: ' || COALESCE(p_receiver_name, 'N/A'),
      p_actor_id, p_actor_id
    ) RETURNING id INTO v_in_id;

  ELSIF p_category = 'RUNNING' THEN
    INSERT INTO public.needle_running_transactions (
      transaction_date, floor_id, needle_item_id, transaction_type, quantity,
      req_no, notes, created_by, updated_by
    ) VALUES (
      p_transaction_date, p_from_floor_id, p_needle_item_id, 'TRANSFER_OUT', p_quantity,
      p_req_no, 'To: ' || v_to_floor_name || ' | Receiver: ' || COALESCE(p_receiver_name, 'N/A'),
      p_actor_id, p_actor_id
    ) RETURNING id INTO v_out_id;

    INSERT INTO public.needle_running_transactions (
      transaction_date, floor_id, needle_item_id, transaction_type, quantity,
      req_no, notes, created_by, updated_by
    ) VALUES (
      p_transaction_date, p_to_floor_id, p_needle_item_id, 'TRANSFER_IN', p_quantity,
      p_req_no, 'From: ' || v_from_floor_name || ' | Receiver: ' || COALESCE(p_receiver_name, 'N/A'),
      p_actor_id, p_actor_id
    ) RETURNING id INTO v_in_id;

  ELSE
    INSERT INTO public.needle_idle_transactions (
      transaction_date, floor_id, needle_item_id, transaction_type, quantity,
      req_no, notes, created_by, updated_by
    ) VALUES (
      p_transaction_date, p_from_floor_id, p_needle_item_id, 'TRANSFER_OUT', p_quantity,
      p_req_no, 'To: ' || v_to_floor_name || ' | Receiver: ' || COALESCE(p_receiver_name, 'N/A'),
      p_actor_id, p_actor_id
    ) RETURNING id INTO v_out_id;

    INSERT INTO public.needle_idle_transactions (
      transaction_date, floor_id, needle_item_id, transaction_type, quantity,
      req_no, notes, created_by, updated_by
    ) VALUES (
      p_transaction_date, p_to_floor_id, p_needle_item_id, 'TRANSFER_IN', p_quantity,
      p_req_no, 'From: ' || v_from_floor_name || ' | Receiver: ' || COALESCE(p_receiver_name, 'N/A'),
      p_actor_id, p_actor_id
    ) RETURNING id INTO v_in_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transfer_out_id', v_out_id,
    'transfer_in_id', v_in_id,
    'from_floor', v_from_floor_name,
    'to_floor', v_to_floor_name,
    'quantity', p_quantity,
    'remaining_stock', v_current_stock - p_quantity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_needle_stock_atomic(TEXT, UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_needle_stock_atomic(TEXT, UUID, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, UUID) TO service_role, authenticated;

COMMIT;
