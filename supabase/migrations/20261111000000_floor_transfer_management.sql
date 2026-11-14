-- ============================================================================
-- Migration: Floor Transfer Edit / Delete Management + History + Atomic RPCs
-- Created: 2026-11-11
-- ============================================================================

-- 1. Permissions for Floor Transfer Edit & Delete
INSERT INTO public.permissions (key, module, page, action, label, description)
VALUES
  (
    'floor_transfer.edit',
    'floor_transfer',
    'floor_transfer',
    'edit',
    'Edit Floor Transfer',
    'Modify destination floor, transfer quantity, receiver name, or requisition number of floor transfers'
  ),
  (
    'floor_transfer.delete',
    'floor_transfer',
    'floor_transfer',
    'delete',
    'Delete Floor Transfer',
    'Cancel/delete floor transfers and reverse stock effects across affected floors'
  )
ON CONFLICT (key) DO NOTHING;

-- Grant to Site Admin role automatically
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.name = 'Site Admin'
  AND r.is_system = true
  AND p.key IN ('floor_transfer.edit', 'floor_transfer.delete')
ON CONFLICT DO NOTHING;

-- 2. Add transfer_group_id linking column on transaction tables (nullable; backwards compatible)
ALTER TABLE public.needle_new_transactions
  ADD COLUMN IF NOT EXISTS transfer_group_id UUID;

ALTER TABLE public.needle_running_transactions
  ADD COLUMN IF NOT EXISTS transfer_group_id UUID;

ALTER TABLE public.needle_idle_transactions
  ADD COLUMN IF NOT EXISTS transfer_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_needle_new_tx_transfer_group
  ON public.needle_new_transactions(transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_needle_running_tx_transfer_group
  ON public.needle_running_transactions(transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_needle_idle_tx_transfer_group
  ON public.needle_idle_transactions(transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

-- Backfill transfer_group_id for existing unlinked TRANSFER_OUT / TRANSFER_IN pairs
DO $$
DECLARE
  v_table TEXT;
  v_out RECORD;
  v_in_id UUID;
  v_group_id UUID;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'needle_new_transactions',
    'needle_running_transactions',
    'needle_idle_transactions'
  ]
  LOOP
    FOR v_out IN EXECUTE format(
      $q$
      SELECT o.id, o.transaction_date, o.floor_id, o.needle_item_id, o.quantity, o.req_no, o.notes, o.created_at,
             f.name AS from_floor_name
      FROM public.%I o
      JOIN public.floors f ON f.id = o.floor_id
      WHERE o.transaction_type = 'TRANSFER_OUT'
        AND o.transfer_group_id IS NULL
      ORDER BY o.transaction_date ASC, o.created_at ASC, o.id ASC
      $q$,
      v_table
    )
    LOOP
      v_in_id := NULL;
      EXECUTE format(
        $q$
        SELECT i.id
        FROM public.%I i
        JOIN public.floors dest_f ON dest_f.id = i.floor_id
        WHERE i.transaction_type = 'TRANSFER_IN'
          AND i.transfer_group_id IS NULL
          AND i.transaction_date = $1
          AND i.needle_item_id = $2
          AND i.quantity = $3
          AND COALESCE(i.req_no, '') = COALESCE($4, '')
          AND starts_with(COALESCE($5, ''), 'To: ' || dest_f.name || ' | Receiver: ')
          AND starts_with(COALESCE(i.notes, ''), 'From: ' || $6 || ' | Receiver: ')
        ORDER BY ABS(EXTRACT(EPOCH FROM (i.created_at - $7))) ASC, i.id ASC
        LIMIT 1
        $q$,
        v_table
      )
      INTO v_in_id
      USING v_out.transaction_date,
            v_out.needle_item_id,
            v_out.quantity,
            v_out.req_no,
            v_out.notes,
            v_out.from_floor_name,
            v_out.created_at;

      IF v_in_id IS NOT NULL THEN
        v_group_id := gen_random_uuid();
        EXECUTE format('UPDATE public.%I SET transfer_group_id = $1 WHERE id IN ($2, $3)', v_table)
        USING v_group_id, v_out.id, v_in_id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 3. Transfer History / Cancellation Archive Table (preserves historical evidence cleanly)
CREATE TABLE IF NOT EXISTS public.needle_floor_transfer_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_group_id UUID,
  transfer_out_id UUID NOT NULL,
  transfer_in_id UUID,
  category TEXT NOT NULL CHECK (category IN ('NEW', 'RUNNING', 'IDLE')),
  status TEXT NOT NULL CHECK (status IN ('edited', 'cancelled')),
  needle_item_id UUID NOT NULL,
  transfer_date DATE NOT NULL,
  from_floor_id UUID NOT NULL REFERENCES public.floors(id) ON DELETE RESTRICT,
  to_floor_id UUID NOT NULL REFERENCES public.floors(id) ON DELETE RESTRICT,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  receiver_name TEXT,
  req_no TEXT,
  previous_data JSONB,
  new_data JSONB,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  operation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_floor_transfer_history_operation_id
  ON public.needle_floor_transfer_history(operation_id)
  WHERE operation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_floor_transfer_history_lookup
  ON public.needle_floor_transfer_history(category, transfer_date, needle_item_id);

CREATE INDEX IF NOT EXISTS idx_floor_transfer_history_transfer_out
  ON public.needle_floor_transfer_history(transfer_out_id);

ALTER TABLE public.needle_floor_transfer_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read needle_floor_transfer_history for authenticated" ON public.needle_floor_transfer_history;
CREATE POLICY "Allow read needle_floor_transfer_history for authenticated"
  ON public.needle_floor_transfer_history FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow full access for service_role on needle_floor_transfer_history" ON public.needle_floor_transfer_history;
CREATE POLICY "Allow full access for service_role on needle_floor_transfer_history"
  ON public.needle_floor_transfer_history FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Helper: Resolve Transaction Table Name by Category
CREATE OR REPLACE FUNCTION public.get_needle_tx_table_name(p_category TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN CASE UPPER(COALESCE(p_category, ''))
    WHEN 'NEW' THEN 'needle_new_transactions'
    WHEN 'RUNNING' THEN 'needle_running_transactions'
    WHEN 'IDLE' THEN 'needle_idle_transactions'
    ELSE NULL
  END;
END;
$$;

-- 5. Helper: Validate Chronological Stock Chain After a Floor Delta From a Given Date Onwards
CREATE OR REPLACE FUNCTION public.validate_needle_floor_stock_after_delta(
  p_table_name TEXT,
  p_floor_id UUID,
  p_needle_item_id UUID,
  p_from_date DATE,
  p_delta NUMERIC
)
RETURNS TABLE(is_valid BOOLEAN, failing_date DATE, min_projected_balance NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_running NUMERIC := 0;
  v_projected NUMERIC := 0;
  v_min NUMERIC := NULL;
  v_fail_date DATE := NULL;
  v_row RECORD;
BEGIN
  -- Optimization: only reductions (p_delta < 0) can make a non-negative balance negative
  IF COALESCE(p_delta, 0) >= 0 THEN
    is_valid := true;
    failing_date := NULL;
    min_projected_balance := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Starting closing balance through p_from_date (inclusive)
  EXECUTE format(
    $q$
    SELECT COALESCE(SUM(
      CASE
        WHEN transaction_type IN ('OPENING', 'RECEIVE', 'RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PRODUCTION_IN') THEN quantity
        WHEN transaction_type IN ('ISSUE', 'DELIVERY', 'TRANSFER_OUT', 'ADJUSTMENT_OUT') THEN -quantity
        ELSE 0
      END
    ), 0)
    FROM public.%I
    WHERE floor_id = $1
      AND needle_item_id = $2
      AND transaction_date <= $3
    $q$,
    p_table_name
  )
  INTO v_running
  USING p_floor_id, p_needle_item_id, p_from_date;

  v_projected := v_running + p_delta;
  v_min := v_projected;
  IF v_projected < 0 THEN
    v_fail_date := p_from_date;
  END IF;

  -- Step chronologically through every subsequent date with transactions
  FOR v_row IN EXECUTE format(
    $q$
    SELECT transaction_date,
           COALESCE(SUM(
             CASE
               WHEN transaction_type IN ('OPENING', 'RECEIVE', 'RECEIPT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'PRODUCTION_IN') THEN quantity
               WHEN transaction_type IN ('ISSUE', 'DELIVERY', 'TRANSFER_OUT', 'ADJUSTMENT_OUT') THEN -quantity
               ELSE 0
             END
           ), 0) AS net_change
    FROM public.%I
    WHERE floor_id = $1
      AND needle_item_id = $2
      AND transaction_date > $3
    GROUP BY transaction_date
    ORDER BY transaction_date ASC
    $q$,
    p_table_name
  )
  USING p_floor_id, p_needle_item_id, p_from_date
  LOOP
    v_running := v_running + v_row.net_change;
    v_projected := v_running + p_delta;
    IF v_min IS NULL OR v_projected < v_min THEN
      v_min := v_projected;
    END IF;
    IF v_fail_date IS NULL AND v_projected < 0 THEN
      v_fail_date := v_row.transaction_date;
    END IF;
  END LOOP;

  is_valid := (v_fail_date IS NULL);
  failing_date := v_fail_date;
  min_projected_balance := v_min;
  RETURN NEXT;
END;
$$;

-- 6. Helper: Resolve Paired TRANSFER_IN Row for a Given TRANSFER_OUT ID (with row lock)
CREATE OR REPLACE FUNCTION public.resolve_needle_transfer_pair_locked(
  p_table_name TEXT,
  p_transfer_out_id UUID
)
RETURNS TABLE(
  out_id UUID,
  in_id UUID,
  transfer_group_id UUID,
  transaction_date DATE,
  needle_item_id UUID,
  from_floor_id UUID,
  to_floor_id UUID,
  quantity NUMERIC,
  req_no TEXT,
  out_notes TEXT,
  in_notes TEXT,
  from_floor_name TEXT,
  to_floor_name TEXT,
  receiver_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_out RECORD;
  v_in RECORD;
  v_from_name TEXT;
  v_to_name TEXT;
  v_receiver TEXT;
  v_idx INTEGER;
BEGIN
  EXECUTE format(
    'SELECT * FROM public.%I WHERE id = $1 AND transaction_type = ''TRANSFER_OUT'' FOR UPDATE',
    p_table_name
  )
  INTO v_out
  USING p_transfer_out_id;

  IF v_out.id IS NULL THEN
    RAISE EXCEPTION 'Transfer record not found or already deleted';
  END IF;

  SELECT name INTO v_from_name FROM public.floors WHERE id = v_out.floor_id;

  -- Try direct transfer_group_id match first
  IF v_out.transfer_group_id IS NOT NULL THEN
    EXECUTE format(
      'SELECT * FROM public.%I WHERE transfer_group_id = $1 AND transaction_type = ''TRANSFER_IN'' LIMIT 1 FOR UPDATE',
      p_table_name
    )
    INTO v_in
    USING v_out.transfer_group_id;
  END IF;

  -- Fallback dynamic 1-to-1 match by date, needle, quantity, req_no, notes & closest timestamp
  IF v_in.id IS NULL THEN
    EXECUTE format(
      $q$
      SELECT i.*
      FROM public.%I i
      JOIN public.floors dest_f ON dest_f.id = i.floor_id
      WHERE i.transaction_type = 'TRANSFER_IN'
        AND i.transaction_date = $1
        AND i.needle_item_id = $2
        AND i.quantity = $3
        AND COALESCE(i.req_no, '') = COALESCE($4, '')
        AND starts_with(COALESCE($5, ''), 'To: ' || dest_f.name || ' | Receiver: ')
        AND starts_with(COALESCE(i.notes, ''), 'From: ' || COALESCE($6, '') || ' | Receiver: ')
      ORDER BY (i.transfer_group_id IS NULL) DESC,
               ABS(EXTRACT(EPOCH FROM (i.created_at - $7))) ASC,
               i.id ASC
      LIMIT 1
      FOR UPDATE OF i
      $q$,
      p_table_name
    )
    INTO v_in
    USING v_out.transaction_date,
          v_out.needle_item_id,
          v_out.quantity,
          v_out.req_no,
          v_out.notes,
          v_from_name,
          v_out.created_at;
  END IF;

  IF v_in.id IS NOT NULL THEN
    SELECT name INTO v_to_name FROM public.floors WHERE id = v_in.floor_id;
  END IF;

  -- Parse receiver from out.notes ("To: <floor> | Receiver: <receiver>")
  v_idx := STRPOS(COALESCE(v_out.notes, ''), '| Receiver: ');
  IF v_idx > 0 THEN
    v_receiver := NULLIF(TRIM(SUBSTRING(v_out.notes FROM v_idx + 12)), 'N/A');
  ELSE
    v_receiver := NULL;
  END IF;

  out_id := v_out.id;
  in_id := v_in.id;
  transfer_group_id := v_out.transfer_group_id;
  transaction_date := v_out.transaction_date;
  needle_item_id := v_out.needle_item_id;
  from_floor_id := v_out.floor_id;
  to_floor_id := v_in.floor_id;
  quantity := v_out.quantity;
  req_no := v_out.req_no;
  out_notes := v_out.notes;
  in_notes := v_in.notes;
  from_floor_name := COALESCE(v_from_name, '');
  to_floor_name := COALESCE(v_to_name, '');
  receiver_name := v_receiver;
  RETURN NEXT;
END;
$$;

-- 7. Atomic RPC: Edit Floor Transfer
CREATE OR REPLACE FUNCTION public.edit_needle_floor_transfer_atomic(
  p_category TEXT,
  p_transfer_out_id UUID,
  p_new_to_floor_id UUID,
  p_new_quantity NUMERIC,
  p_new_receiver_name TEXT,
  p_new_req_no TEXT,
  p_actor_id UUID,
  p_operation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_table TEXT;
  v_existing_hist RECORD;
  v_pair RECORD;
  v_new_to_name TEXT;
  v_receiver_label TEXT;
  v_clean_req_no TEXT;
  v_group_id UUID;
  v_lock_floor UUID;
  v_from_delta NUMERIC;
  v_old_to_delta NUMERIC;
  v_check RECORD;
  v_new_out_notes TEXT;
  v_new_in_notes TEXT;
  v_new_in_id UUID;
  v_prev_json JSONB;
  v_new_json JSONB;
BEGIN
  v_table := public.get_needle_tx_table_name(p_category);
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Invalid category: %', p_category;
  END IF;

  IF p_new_quantity IS NULL OR p_new_quantity <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be greater than zero';
  END IF;

  -- Idempotency check
  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existing_hist
    FROM public.needle_floor_transfer_history
    WHERE operation_id = p_operation_id
    LIMIT 1;

    IF v_existing_hist.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'transfer_out_id', v_existing_hist.transfer_out_id,
        'transfer_in_id', v_existing_hist.transfer_in_id,
        'transfer_group_id', v_existing_hist.transfer_group_id,
        'old_data', v_existing_hist.previous_data,
        'new_data', v_existing_hist.new_data
      );
    END IF;
  END IF;

  -- Lock pair rows
  SELECT * INTO v_pair
  FROM public.resolve_needle_transfer_pair_locked(v_table, p_transfer_out_id);

  IF v_pair.in_id IS NULL OR v_pair.to_floor_id IS NULL THEN
    RAISE EXCEPTION 'Matching destination TRANSFER_IN record could not be resolved for this transfer';
  END IF;

  IF p_new_to_floor_id = v_pair.from_floor_id THEN
    RAISE EXCEPTION 'Destination Floor cannot be the same as Source Floor';
  END IF;

  SELECT name INTO v_new_to_name FROM public.floors WHERE id = p_new_to_floor_id;
  IF v_new_to_name IS NULL THEN
    RAISE EXCEPTION 'Selected destination Floor not found';
  END IF;

  -- Serialize concurrent balance changes per (needle, floor) in deterministic order
  FOR v_lock_floor IN
    SELECT DISTINCT fid
    FROM unnest(ARRAY[v_pair.from_floor_id, v_pair.to_floor_id, p_new_to_floor_id]) AS fid
    WHERE fid IS NOT NULL
    ORDER BY fid ASC
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext(UPPER(p_category) || ':' || v_pair.needle_item_id::text || ':' || v_lock_floor::text)
    );
  END LOOP;

  -- Validate source floor chronological stock balance (from transfer date onwards)
  v_from_delta := v_pair.quantity - p_new_quantity;
  IF v_from_delta < 0 THEN
    SELECT * INTO v_check
    FROM public.validate_needle_floor_stock_after_delta(
      v_table,
      v_pair.from_floor_id,
      v_pair.needle_item_id,
      v_pair.transaction_date,
      v_from_delta
    );
    IF NOT v_check.is_valid THEN
      RAISE EXCEPTION 'Cannot update transfer: insufficient available stock on source Floor (%) on % (projected balance: %).',
        v_pair.from_floor_name, v_check.failing_date, v_check.min_projected_balance;
    END IF;
  END IF;

  -- Validate old / same destination floor chronological stock balance
  IF p_new_to_floor_id = v_pair.to_floor_id THEN
    v_old_to_delta := p_new_quantity - v_pair.quantity;
  ELSE
    v_old_to_delta := -v_pair.quantity;
  END IF;

  IF v_old_to_delta < 0 THEN
    SELECT * INTO v_check
    FROM public.validate_needle_floor_stock_after_delta(
      v_table,
      v_pair.to_floor_id,
      v_pair.needle_item_id,
      v_pair.transaction_date,
      v_old_to_delta
    );
    IF NOT v_check.is_valid THEN
      RAISE EXCEPTION 'Cannot update transfer: the destination Floor (%) has insufficient available stock on % (projected balance: %).',
        v_pair.to_floor_name, v_check.failing_date, v_check.min_projected_balance;
    END IF;
  END IF;

  v_group_id := COALESCE(v_pair.transfer_group_id, gen_random_uuid());
  v_receiver_label := COALESCE(NULLIF(TRIM(p_new_receiver_name), ''), 'N/A');
  v_clean_req_no := NULLIF(TRIM(COALESCE(p_new_req_no, '')), '');
  v_new_out_notes := 'To: ' || v_new_to_name || ' | Receiver: ' || v_receiver_label;
  v_new_in_notes := 'From: ' || v_pair.from_floor_name || ' | Receiver: ' || v_receiver_label;

  v_prev_json := jsonb_build_object(
    'transfer_out_id', v_pair.out_id,
    'transfer_in_id', v_pair.in_id,
    'transfer_group_id', v_pair.transfer_group_id,
    'category', UPPER(p_category),
    'transfer_date', v_pair.transaction_date,
    'needle_item_id', v_pair.needle_item_id,
    'from_floor_id', v_pair.from_floor_id,
    'from_floor_name', v_pair.from_floor_name,
    'to_floor_id', v_pair.to_floor_id,
    'to_floor_name', v_pair.to_floor_name,
    'quantity', v_pair.quantity,
    'receiver_name', v_pair.receiver_name,
    'req_no', v_pair.req_no,
    'out_notes', v_pair.out_notes,
    'in_notes', v_pair.in_notes
  );

  -- Update TRANSFER_OUT atomically
  EXECUTE format(
    $q$
    UPDATE public.%I
    SET quantity = $1,
        req_no = $2,
        notes = $3,
        transfer_group_id = $4,
        updated_by = $5,
        updated_at = NOW()
    WHERE id = $6
    $q$,
    v_table
  )
  USING p_new_quantity, v_clean_req_no, v_new_out_notes, v_group_id, p_actor_id, v_pair.out_id;

  -- Update or move TRANSFER_IN atomically (DELETE + INSERT on floor change so Supabase Realtime emits events to both floors)
  IF p_new_to_floor_id = v_pair.to_floor_id THEN
    v_new_in_id := v_pair.in_id;
    EXECUTE format(
      $q$
      UPDATE public.%I
      SET quantity = $1,
          req_no = $2,
          notes = $3,
          transfer_group_id = $4,
          updated_by = $5,
          updated_at = NOW()
      WHERE id = $6
      $q$,
      v_table
    )
    USING p_new_quantity, v_clean_req_no, v_new_in_notes, v_group_id, p_actor_id, v_pair.in_id;
  ELSE
    v_new_in_id := gen_random_uuid();
    EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_table)
    USING v_pair.in_id;

    EXECUTE format(
      $q$
      INSERT INTO public.%I (
        id, transaction_date, floor_id, needle_item_id, transaction_type,
        quantity, req_no, notes, transfer_group_id, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, 'TRANSFER_IN', $5, $6, $7, $8, $9, $9)
      $q$,
      v_table
    )
    USING v_new_in_id, v_pair.transaction_date, p_new_to_floor_id, v_pair.needle_item_id,
          p_new_quantity, v_clean_req_no, v_new_in_notes, v_group_id, p_actor_id;
  END IF;

  v_new_json := jsonb_build_object(
    'transfer_out_id', v_pair.out_id,
    'transfer_in_id', v_new_in_id,
    'transfer_group_id', v_group_id,
    'category', UPPER(p_category),
    'transfer_date', v_pair.transaction_date,
    'needle_item_id', v_pair.needle_item_id,
    'from_floor_id', v_pair.from_floor_id,
    'from_floor_name', v_pair.from_floor_name,
    'to_floor_id', p_new_to_floor_id,
    'to_floor_name', v_new_to_name,
    'quantity', p_new_quantity,
    'receiver_name', NULLIF(TRIM(COALESCE(p_new_receiver_name, '')), ''),
    'req_no', v_clean_req_no,
    'out_notes', v_new_out_notes,
    'in_notes', v_new_in_notes
  );

  INSERT INTO public.needle_floor_transfer_history (
    transfer_group_id,
    transfer_out_id,
    transfer_in_id,
    category,
    status,
    needle_item_id,
    transfer_date,
    from_floor_id,
    to_floor_id,
    quantity,
    receiver_name,
    req_no,
    previous_data,
    new_data,
    actor_user_id,
    operation_id
  ) VALUES (
    v_group_id,
    v_pair.out_id,
    v_new_in_id,
    UPPER(p_category),
    'edited',
    v_pair.needle_item_id,
    v_pair.transaction_date,
    v_pair.from_floor_id,
    p_new_to_floor_id,
    p_new_quantity,
    NULLIF(TRIM(COALESCE(p_new_receiver_name, '')), ''),
    v_clean_req_no,
    v_prev_json,
    v_new_json,
    p_actor_id,
    p_operation_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'transfer_out_id', v_pair.out_id,
    'transfer_in_id', v_new_in_id,
    'transfer_group_id', v_group_id,
    'old_data', v_prev_json,
    'new_data', v_new_json
  );
END;
$$;

-- 8. Atomic RPC: Delete / Cancel Floor Transfer
CREATE OR REPLACE FUNCTION public.delete_needle_floor_transfer_atomic(
  p_category TEXT,
  p_transfer_out_id UUID,
  p_actor_id UUID,
  p_operation_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_table TEXT;
  v_existing_hist RECORD;
  v_pair RECORD;
  v_lock_floor UUID;
  v_check RECORD;
  v_prev_json JSONB;
BEGIN
  v_table := public.get_needle_tx_table_name(p_category);
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Invalid category: %', p_category;
  END IF;

  -- Idempotency check
  IF p_operation_id IS NOT NULL THEN
    SELECT * INTO v_existing_hist
    FROM public.needle_floor_transfer_history
    WHERE operation_id = p_operation_id
    LIMIT 1;

    IF v_existing_hist.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'transfer_out_id', v_existing_hist.transfer_out_id,
        'transfer_in_id', v_existing_hist.transfer_in_id,
        'transfer_group_id', v_existing_hist.transfer_group_id,
        'old_data', v_existing_hist.previous_data
      );
    END IF;
  END IF;

  -- Lock pair rows
  SELECT * INTO v_pair
  FROM public.resolve_needle_transfer_pair_locked(v_table, p_transfer_out_id);

  IF v_pair.in_id IS NULL OR v_pair.to_floor_id IS NULL THEN
    RAISE EXCEPTION 'Matching destination TRANSFER_IN record could not be resolved for this transfer';
  END IF;

  -- Serialize concurrent balance changes on affected floors
  FOR v_lock_floor IN
    SELECT DISTINCT fid
    FROM unnest(ARRAY[v_pair.from_floor_id, v_pair.to_floor_id]) AS fid
    WHERE fid IS NOT NULL
    ORDER BY fid ASC
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtext(UPPER(p_category) || ':' || v_pair.needle_item_id::text || ':' || v_lock_floor::text)
    );
  END LOOP;

  -- Reversing transfer removes v_pair.quantity from destination floor from transfer date onwards
  SELECT * INTO v_check
  FROM public.validate_needle_floor_stock_after_delta(
    v_table,
    v_pair.to_floor_id,
    v_pair.needle_item_id,
    v_pair.transaction_date,
    -v_pair.quantity
  );
  IF NOT v_check.is_valid THEN
    RAISE EXCEPTION 'Cannot delete this transfer. The destination Floor (%) has insufficient available stock on % (projected balance: %).',
      v_pair.to_floor_name, v_check.failing_date, v_check.min_projected_balance;
  END IF;

  v_prev_json := jsonb_build_object(
    'transfer_out_id', v_pair.out_id,
    'transfer_in_id', v_pair.in_id,
    'transfer_group_id', v_pair.transfer_group_id,
    'category', UPPER(p_category),
    'transfer_date', v_pair.transaction_date,
    'needle_item_id', v_pair.needle_item_id,
    'from_floor_id', v_pair.from_floor_id,
    'from_floor_name', v_pair.from_floor_name,
    'to_floor_id', v_pair.to_floor_id,
    'to_floor_name', v_pair.to_floor_name,
    'quantity', v_pair.quantity,
    'receiver_name', v_pair.receiver_name,
    'req_no', v_pair.req_no,
    'out_notes', v_pair.out_notes,
    'in_notes', v_pair.in_notes
  );

  -- Archive full historical evidence first
  INSERT INTO public.needle_floor_transfer_history (
    transfer_group_id,
    transfer_out_id,
    transfer_in_id,
    category,
    status,
    needle_item_id,
    transfer_date,
    from_floor_id,
    to_floor_id,
    quantity,
    receiver_name,
    req_no,
    previous_data,
    new_data,
    actor_user_id,
    operation_id
  ) VALUES (
    v_pair.transfer_group_id,
    v_pair.out_id,
    v_pair.in_id,
    UPPER(p_category),
    'cancelled',
    v_pair.needle_item_id,
    v_pair.transaction_date,
    v_pair.from_floor_id,
    v_pair.to_floor_id,
    v_pair.quantity,
    v_pair.receiver_name,
    v_pair.req_no,
    v_prev_json,
    NULL,
    p_actor_id,
    p_operation_id
  );

  -- Atomically remove both active transfer rows so stock/reports stay clean
  EXECUTE format('DELETE FROM public.%I WHERE id IN ($1, $2)', v_table)
  USING v_pair.out_id, v_pair.in_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'transfer_out_id', v_pair.out_id,
    'transfer_in_id', v_pair.in_id,
    'transfer_group_id', v_pair.transfer_group_id,
    'old_data', v_prev_json
  );
END;
$$;
