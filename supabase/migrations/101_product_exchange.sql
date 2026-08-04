-- ── Product Exchange Support ─────────────────────────────────────────────────
-- Adds is_exchange + exchange_original_id columns to sales table and creates
-- the process_exchange() atomic function.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS is_exchange          BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exchange_original_id UUID     REFERENCES sales(id);

CREATE INDEX IF NOT EXISTS idx_sales_exchange_original
  ON sales (exchange_original_id)
  WHERE exchange_original_id IS NOT NULL;

-- ── process_exchange ──────────────────────────────────────────────────────────
-- Atomically:
--   1. Validates return quantities (same guard as process_refund)
--   2. Restores inventory for returned items  (stock_movements type='return')
--   3. Deducts  inventory for new items       (stock_movements type='sale')
--   4. Inserts refund record  (is_refund=true)  and updates original sale status
--   5. Inserts exchange sale  (is_exchange=true) for net amount only
-- Returns: { refund_id, exchange_sale_id, returned_total, new_total, net_difference }

CREATE OR REPLACE FUNCTION process_exchange(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sale           sales%ROWTYPE;
  v_item           JSONB;
  v_inv            inventory%ROWTYPE;
  v_orig_qty       INT;
  v_refunded_qty   INT;
  v_returned_ttl   NUMERIC := 0;
  v_new_ttl        NUMERIC := 0;
  v_net            NUMERIC;
  v_pstatus        TEXT;
  v_amount_paid    NUMERIC;
  v_refund_id      UUID := gen_random_uuid();
  v_exch_id        UUID := gen_random_uuid();
  v_branch_id      UUID;
  v_total_refunded NUMERIC;
BEGIN
  -- ── Lock and validate original sale ────────────────────────────────────────
  SELECT * INTO v_sale FROM sales
  WHERE id = (p_data->>'original_sale_id')::UUID
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original sale not found';
  END IF;
  IF v_sale.is_refund OR v_sale.is_exchange THEN
    RAISE EXCEPTION 'Cannot exchange a refund or exchange transaction';
  END IF;

  v_branch_id := v_sale.branch_id;

  -- ── Step 1: Validate & restock returned items ───────────────────────────────
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_data->'returned_items') LOOP
    -- How many were originally sold?
    SELECT si.quantity INTO v_orig_qty
    FROM sale_items si
    WHERE si.sale_id = v_sale.id
      AND (si.product_id IS NOT DISTINCT FROM (v_item->>'product_id')::UUID)
      AND (si.variant_id  IS NOT DISTINCT FROM (v_item->>'variant_id')::UUID)
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found in original sale: %', v_item->>'name';
    END IF;

    -- How many already returned (across all prior refunds/exchanges)?
    SELECT COALESCE(SUM(ABS(si.quantity)), 0) INTO v_refunded_qty
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.original_sale_id = v_sale.id
      AND s.is_refund = true
      AND (si.product_id IS NOT DISTINCT FROM (v_item->>'product_id')::UUID)
      AND (si.variant_id  IS NOT DISTINCT FROM (v_item->>'variant_id')::UUID);

    IF (v_item->>'quantity')::INT > (v_orig_qty - v_refunded_qty) THEN
      RAISE EXCEPTION 'Return qty exceeds available qty for item: %', v_item->>'name';
    END IF;

    -- Restock inventory (skip services)
    IF NOT COALESCE((v_item->>'is_service')::BOOLEAN, false) THEN
      SELECT * INTO v_inv FROM inventory
      WHERE branch_id = v_branch_id
        AND (product_id IS NOT DISTINCT FROM (v_item->>'product_id')::UUID)
        AND (variant_id  IS NOT DISTINCT FROM (v_item->>'variant_id')::UUID)
      FOR UPDATE;

      IF FOUND THEN
        UPDATE inventory
        SET quantity = quantity + (v_item->>'quantity')::INT
        WHERE id = v_inv.id;
      END IF;

      INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, reference_id, note, created_by)
      VALUES (
        v_branch_id,
        (v_item->>'product_id')::UUID,
        (v_item->>'variant_id')::UUID,
        'return',
        (v_item->>'quantity')::INT,
        v_refund_id,
        'Product exchange – return',
        (p_data->>'cashier_id')::UUID
      );
    END IF;

    v_returned_ttl := v_returned_ttl + (v_item->>'total')::NUMERIC;
  END LOOP;

  -- ── Step 2: Validate stock & deduct new items ───────────────────────────────
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_data->'new_items') LOOP
    IF NOT COALESCE((v_item->>'is_service')::BOOLEAN, false) THEN
      SELECT * INTO v_inv FROM inventory
      WHERE branch_id = v_branch_id
        AND (product_id IS NOT DISTINCT FROM (v_item->>'product_id')::UUID)
        AND (variant_id  IS NOT DISTINCT FROM (v_item->>'variant_id')::UUID)
      FOR UPDATE;

      IF FOUND THEN
        IF v_inv.quantity < (v_item->>'quantity')::INT THEN
          RAISE EXCEPTION 'Insufficient stock for: %', v_item->>'name';
        END IF;
        UPDATE inventory
        SET quantity = quantity - (v_item->>'quantity')::INT
        WHERE id = v_inv.id;
      END IF;

      INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, reference_id, note, created_by)
      VALUES (
        v_branch_id,
        (v_item->>'product_id')::UUID,
        (v_item->>'variant_id')::UUID,
        'sale',
        -(v_item->>'quantity')::INT,
        v_exch_id,
        'Product exchange – new item',
        (p_data->>'cashier_id')::UUID
      );
    END IF;

    v_new_ttl := v_new_ttl + (v_item->>'total')::NUMERIC;
  END LOOP;

  v_net := v_new_ttl - v_returned_ttl;

  -- ── Step 3: Create refund record for returned items ─────────────────────────
  INSERT INTO sales (
    id, branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_status, amount_paid,
    is_refund, original_sale_id, refund_reason
  ) VALUES (
    v_refund_id, v_branch_id,
    (p_data->>'customer_id')::UUID,
    (p_data->>'cashier_id')::UUID,
    -v_returned_ttl, 0, 0, -v_returned_ttl,
    v_sale.payment_method, 'refunded', 0,
    true, v_sale.id, 'Product exchange'
  );

  INSERT INTO sale_items (sale_id, product_id, variant_id, name, quantity, unit_price, discount, total)
  SELECT
    v_refund_id,
    (r.value->>'product_id')::UUID,
    (r.value->>'variant_id')::UUID,
    r.value->>'name',
    -((r.value->>'quantity')::INT),
    (r.value->>'unit_price')::NUMERIC,
    0,
    -((r.value->>'total')::NUMERIC)
  FROM jsonb_array_elements(p_data->'returned_items') AS r;

  -- ── Step 4: Update original sale payment_status ─────────────────────────────
  SELECT COALESCE(SUM(ABS(total)), 0) INTO v_total_refunded
  FROM sales
  WHERE original_sale_id = v_sale.id AND is_refund = true;

  IF v_total_refunded >= v_sale.total THEN
    UPDATE sales SET payment_status = 'refunded' WHERE id = v_sale.id;
  ELSIF v_total_refunded > 0 THEN
    UPDATE sales SET payment_status = 'partial'  WHERE id = v_sale.id;
  END IF;

  -- ── Step 5: Compute exchange sale payment_status ────────────────────────────
  v_amount_paid := COALESCE((p_data->>'amount_paid')::NUMERIC, 0);

  IF v_net <= 0 THEN
    -- No additional charge; if net < 0 the cashier returns the difference separately
    v_pstatus     := 'paid';
    v_amount_paid := 0;
  ELSIF (p_data->>'payment_method') = 'on_account' THEN
    IF v_amount_paid <= 0       THEN v_pstatus := 'on_account';
    ELSIF v_amount_paid >= v_net THEN v_pstatus := 'paid';
    ELSE                              v_pstatus := 'partial';
    END IF;
  ELSE
    v_pstatus     := 'paid';
    v_amount_paid := 0;
  END IF;

  -- ── Step 6: Create exchange sale record ────────────────────────────────────
  INSERT INTO sales (
    id, branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_status, amount_paid,
    is_exchange, exchange_original_id,
    notes
  ) VALUES (
    v_exch_id, v_branch_id,
    (p_data->>'customer_id')::UUID,
    (p_data->>'cashier_id')::UUID,
    GREATEST(v_net, 0), 0, 0, GREATEST(v_net, 0),
    COALESCE(p_data->>'payment_method', 'cash'),
    v_pstatus,
    v_amount_paid,
    true, v_sale.id,
    'Exchange for sale #' || UPPER(RIGHT(v_sale.id::TEXT, 8))
  );

  INSERT INTO sale_items (sale_id, product_id, variant_id, name, quantity, unit_price, discount, total)
  SELECT
    v_exch_id,
    (n.value->>'product_id')::UUID,
    (n.value->>'variant_id')::UUID,
    n.value->>'name',
    (n.value->>'quantity')::INT,
    (n.value->>'unit_price')::NUMERIC,
    0,
    (n.value->>'total')::NUMERIC
  FROM jsonb_array_elements(p_data->'new_items') AS n;

  RETURN jsonb_build_object(
    'refund_id',        v_refund_id,
    'exchange_sale_id', v_exch_id,
    'returned_total',   v_returned_ttl,
    'new_total',        v_new_ttl,
    'net_difference',   v_net
  );
END;
$$;
