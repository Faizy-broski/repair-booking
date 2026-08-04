-- ============================================================
-- 140 — Guard discount-pool reactivation against a newer active allocation
--
-- process_refund/process_exchange/delete_sale each restore a discount pool
-- on their respective item by unconditionally flipping the ORIGINAL
-- allocation row back to status='active'. If that allocation had already
-- depleted (status='ended') and the user has since started a NEW active
-- discount allocation for the same (product_id, variant_id, branch_id), this
-- unconditional flip collides with the one-active-per-slot partial unique
-- index (product_discount_allocations_one_active), crashing the refund/
-- exchange/delete with a duplicate-key error.
--
-- Fix: before reactivating, check whether a DIFFERENT allocation already
-- holds the active slot for that product/variant/branch. If so, restore
-- quantity_remaining for bookkeeping but leave status untouched — the units
-- are already back in normal stock via the unconditional inventory UPDATE
-- each function already does regardless of this discount-pool bookkeeping.
-- ============================================================

-- ── process_refund ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION process_refund(p_refund_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_refund_id       UUID;
  v_item            JSONB;
  v_original_id     UUID;
  v_orig_qty        INT;
  v_refunded_qty    INT;
  v_all_refunded    BOOLEAN;
  v_item_cost       NUMERIC;
  v_discount_alloc  UUID;
  v_alloc_product   UUID;
  v_alloc_variant   UUID;
  v_alloc_branch    UUID;
  v_can_reactivate  BOOLEAN;
BEGIN
  v_original_id := NULLIF(p_refund_data->>'original_sale_id', '')::UUID;

  IF v_original_id IS NOT NULL THEN
    PERFORM 1 FROM sales WHERE id = v_original_id FOR UPDATE;
  END IF;

  -- Validate per-item remaining quantities
  IF v_original_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_refund_data->'items')
    LOOP
      SELECT COALESCE(SUM(si.quantity), 0) INTO v_orig_qty
      FROM sale_items si WHERE si.sale_id = v_original_id AND si.name = v_item->>'name';

      SELECT COALESCE(SUM(si.quantity), 0) INTO v_refunded_qty
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.original_sale_id = v_original_id AND s.is_refund = true AND si.name = v_item->>'name';

      IF (v_item->>'quantity')::INT > (v_orig_qty - v_refunded_qty) THEN
        RAISE EXCEPTION 'Cannot refund more than remaining quantity for: %', v_item->>'name';
      END IF;
    END LOOP;
  END IF;

  -- Insert the refund sale record (negative total)
  INSERT INTO sales (
    branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_status,
    is_refund, refund_reason, original_sale_id,
    notes
  )
  VALUES (
    (p_refund_data->>'branch_id')::UUID,
    NULLIF(p_refund_data->>'customer_id', '')::UUID,
    NULLIF(p_refund_data->>'cashier_id', '')::UUID,
    -((p_refund_data->>'subtotal')::NUMERIC),
    0,
    -((p_refund_data->>'tax')::NUMERIC),
    -((p_refund_data->>'total')::NUMERIC),
    COALESCE(p_refund_data->>'payment_method', 'cash'),
    'refunded',
    true,
    p_refund_data->>'refund_reason',
    v_original_id,
    'Refund for sale ' || COALESCE(p_refund_data->>'original_sale_id', '')
  )
  RETURNING id INTO v_refund_id;

  -- Insert refund line items and restore inventory
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_refund_data->'items')
  LOOP
    v_item_cost      := NULL;
    v_discount_alloc := NULL;
    IF v_original_id IS NOT NULL THEN
      SELECT si.unit_cost, si.discount_allocation_id INTO v_item_cost, v_discount_alloc
      FROM sale_items si
      WHERE si.sale_id = v_original_id AND si.name = v_item->>'name'
      LIMIT 1;
    END IF;

    INSERT INTO sale_items (
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, unit_cost, discount_allocation_id
    )
    VALUES (
      v_refund_id,
      NULLIF(v_item->>'product_id', '')::UUID,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      0,
      -((v_item->>'total')::NUMERIC),
      v_item_cost,
      v_discount_alloc
    );

    IF (v_item->>'is_service')::BOOLEAN IS NOT TRUE THEN
      UPDATE inventory
      SET quantity = quantity + (v_item->>'quantity')::INT, updated_at = NOW()
      WHERE branch_id = (p_refund_data->>'branch_id')::UUID
        AND product_id = NULLIF(v_item->>'product_id', '')::UUID
        AND (
          variant_id = NULLIF(v_item->>'variant_id', '')::UUID
          OR (variant_id IS NULL AND NULLIF(v_item->>'variant_id', '') IS NULL)
        );

      PERFORM restore_cost_layer(
        NULLIF(v_item->>'product_id', '')::UUID,
        (p_refund_data->>'branch_id')::UUID,
        (v_item->>'quantity')::INT,
        v_item_cost
      );

      -- A discount-priced line refunds back into the SAME discount pool it
      -- was sold from, not the normal pool — reactivating the allocation if
      -- it had ended from depletion, UNLESS a different allocation already
      -- claims the active slot for this product/variant/branch (see header).
      IF v_discount_alloc IS NOT NULL THEN
        SELECT product_id, variant_id, branch_id INTO v_alloc_product, v_alloc_variant, v_alloc_branch
        FROM product_discount_allocations WHERE id = v_discount_alloc FOR UPDATE;

        SELECT NOT EXISTS (
          SELECT 1 FROM product_discount_allocations
          WHERE id <> v_discount_alloc AND status = 'active'
            AND product_id = v_alloc_product AND branch_id = v_alloc_branch
            AND variant_id IS NOT DISTINCT FROM v_alloc_variant
        ) INTO v_can_reactivate;

        UPDATE product_discount_allocations
        SET quantity_remaining = quantity_remaining + (v_item->>'quantity')::INT,
            status   = CASE WHEN v_can_reactivate THEN 'active' ELSE status END,
            ended_at = CASE WHEN v_can_reactivate THEN NULL ELSE ended_at END
        WHERE id = v_discount_alloc;
      END IF;

      INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, reference_id, note)
      VALUES (
        (p_refund_data->>'branch_id')::UUID,
        NULLIF(v_item->>'product_id', '')::UUID,
        NULLIF(v_item->>'variant_id', '')::UUID,
        'return', (v_item->>'quantity')::INT, v_refund_id, 'POS Refund'
      );
    END IF;
  END LOOP;

  -- Update original sale status: 'refunded' if all items done, 'partial' if some remain
  IF v_original_id IS NOT NULL THEN
    SELECT bool_and(
      (
        SELECT COALESCE(SUM(ri.quantity), 0)
        FROM sale_items ri
        JOIN sales rs ON rs.id = ri.sale_id
        WHERE rs.original_sale_id = v_original_id AND rs.is_refund = true AND ri.name = osi.name
      ) >= osi.quantity
    ) INTO v_all_refunded
    FROM sale_items osi WHERE osi.sale_id = v_original_id;

    UPDATE sales
    SET payment_status = CASE WHEN v_all_refunded THEN 'refunded' ELSE 'partial' END
    WHERE id = v_original_id;
  END IF;

  RETURN v_refund_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── process_exchange ─────────────────────────────────────────────────────

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
  v_item_cost      NUMERIC;
  v_unit_cost      NUMERIC;
  v_discount_alloc UUID;
  v_alloc_product  UUID;
  v_alloc_variant  UUID;
  v_alloc_branch   UUID;
  v_can_reactivate BOOLEAN;
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

  -- ── Placeholder refund/exchange sales rows (real totals patched below) ────
  INSERT INTO sales (
    id, branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_status, amount_paid,
    is_refund, original_sale_id, refund_reason
  ) VALUES (
    v_refund_id, v_branch_id,
    (p_data->>'customer_id')::UUID,
    (p_data->>'cashier_id')::UUID,
    0, 0, 0, 0,
    v_sale.payment_method, 'refunded', 0,
    true, v_sale.id, 'Product exchange'
  );

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
    0, 0, 0, 0,
    COALESCE(p_data->>'payment_method', 'cash'), 'paid', 0,
    true, v_sale.id,
    'Exchange for sale #' || UPPER(RIGHT(v_sale.id::TEXT, 8))
  );

  -- ── Step 1: Validate, restock returned items at their frozen cost ─────────
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_data->'returned_items') LOOP
    SELECT si.quantity, si.unit_cost, si.discount_allocation_id INTO v_orig_qty, v_item_cost, v_discount_alloc
    FROM sale_items si
    WHERE si.sale_id = v_sale.id
      AND (si.product_id IS NOT DISTINCT FROM (v_item->>'product_id')::UUID)
      AND (si.variant_id  IS NOT DISTINCT FROM (v_item->>'variant_id')::UUID)
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found in original sale: %', v_item->>'name';
    END IF;

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

      PERFORM restore_cost_layer(
        (v_item->>'product_id')::UUID, v_branch_id,
        (v_item->>'quantity')::INT, v_item_cost
      );

      IF v_discount_alloc IS NOT NULL THEN
        SELECT product_id, variant_id, branch_id INTO v_alloc_product, v_alloc_variant, v_alloc_branch
        FROM product_discount_allocations WHERE id = v_discount_alloc FOR UPDATE;

        SELECT NOT EXISTS (
          SELECT 1 FROM product_discount_allocations
          WHERE id <> v_discount_alloc AND status = 'active'
            AND product_id = v_alloc_product AND branch_id = v_alloc_branch
            AND variant_id IS NOT DISTINCT FROM v_alloc_variant
        ) INTO v_can_reactivate;

        UPDATE product_discount_allocations
        SET quantity_remaining = quantity_remaining + (v_item->>'quantity')::INT,
            status   = CASE WHEN v_can_reactivate THEN 'active' ELSE status END,
            ended_at = CASE WHEN v_can_reactivate THEN NULL ELSE ended_at END
        WHERE id = v_discount_alloc;
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

    INSERT INTO sale_items (sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, unit_cost, discount_allocation_id)
    VALUES (
      v_refund_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'variant_id')::UUID,
      v_item->>'name',
      -((v_item->>'quantity')::INT),
      (v_item->>'unit_price')::NUMERIC,
      0,
      -((v_item->>'total')::NUMERIC),
      v_item_cost,
      v_discount_alloc
    );

    v_returned_ttl := v_returned_ttl + (v_item->>'total')::NUMERIC;
  END LOOP;

  UPDATE sales SET subtotal = -v_returned_ttl, total = -v_returned_ttl WHERE id = v_refund_id;

  -- ── Step 2: Validate stock, deduct + freeze cost for new items ────────────
  -- (Discount pricing on the NEW side of an exchange is out of scope — the
  -- discount picker is a POS-cart concept; new_items here always sell at
  -- whatever unit_price the client sends, same as before this migration.)
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_data->'new_items') LOOP
    v_unit_cost := 0;
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

        v_unit_cost := consume_and_freeze_cost(
          (v_item->>'product_id')::UUID, v_branch_id,
          (v_item->>'quantity')::INT, v_inv.quantity
        );

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

    INSERT INTO sale_items (sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, unit_cost)
    VALUES (
      v_exch_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'variant_id')::UUID,
      v_item->>'name',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      0,
      (v_item->>'total')::NUMERIC,
      v_unit_cost
    );

    v_new_ttl := v_new_ttl + (v_item->>'total')::NUMERIC;
  END LOOP;

  v_net := v_new_ttl - v_returned_ttl;

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

  -- ── Step 6: Patch exchange sale record with real totals/status ────────────
  UPDATE sales
  SET subtotal       = GREATEST(v_net, 0),
      total          = GREATEST(v_net, 0),
      payment_status = v_pstatus,
      amount_paid    = v_amount_paid
  WHERE id = v_exch_id;

  RETURN jsonb_build_object(
    'refund_id',        v_refund_id,
    'exchange_sale_id', v_exch_id,
    'returned_total',   v_returned_ttl,
    'new_total',        v_new_ttl,
    'net_difference',   v_net
  );
END;
$$;

-- ── delete_sale ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION delete_sale(p_sale_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item            RECORD;
  v_sale            RECORD;
  v_refund_id       UUID;
  v_alloc_product   UUID;
  v_alloc_variant   UUID;
  v_alloc_branch    UUID;
  v_can_reactivate  BOOLEAN;
BEGIN
  SELECT id, branch_id, is_refund, gift_card_id, payment_method, payment_splits
  INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found: %', p_sale_id;
  END IF;

  IF v_sale.is_refund = TRUE THEN
    RAISE EXCEPTION 'Cannot delete a refund record directly.';
  END IF;

  FOR v_item IN
    SELECT
      si.product_id,
      si.variant_id,
      si.unit_cost,
      si.discount_allocation_id,
      (si.quantity - COALESCE((
        SELECT SUM(ri.quantity)
        FROM sale_items ri
        JOIN sales rs ON rs.id = ri.sale_id
        WHERE rs.original_sale_id = p_sale_id
          AND rs.is_refund = TRUE
          AND ri.name = si.name
      ), 0))::INT AS net_qty
    FROM sale_items si
    WHERE si.sale_id = p_sale_id
      AND si.product_id IS NOT NULL
  LOOP
    IF v_item.net_qty > 0 THEN
      UPDATE inventory
      SET    quantity   = quantity + v_item.net_qty,
             updated_at = NOW()
      WHERE  branch_id  = v_sale.branch_id
        AND  product_id = v_item.product_id
        AND  (
               variant_id = v_item.variant_id
               OR (variant_id IS NULL AND v_item.variant_id IS NULL)
             );

      PERFORM restore_cost_layer(v_item.product_id, v_sale.branch_id, v_item.net_qty, v_item.unit_cost);

      IF v_item.discount_allocation_id IS NOT NULL THEN
        SELECT product_id, variant_id, branch_id INTO v_alloc_product, v_alloc_variant, v_alloc_branch
        FROM product_discount_allocations WHERE id = v_item.discount_allocation_id FOR UPDATE;

        SELECT NOT EXISTS (
          SELECT 1 FROM product_discount_allocations
          WHERE id <> v_item.discount_allocation_id AND status = 'active'
            AND product_id = v_alloc_product AND branch_id = v_alloc_branch
            AND variant_id IS NOT DISTINCT FROM v_alloc_variant
        ) INTO v_can_reactivate;

        UPDATE product_discount_allocations
        SET quantity_remaining = quantity_remaining + v_item.net_qty,
            status   = CASE WHEN v_can_reactivate THEN 'active' ELSE status END,
            ended_at = CASE WHEN v_can_reactivate THEN NULL ELSE ended_at END
        WHERE id = v_item.discount_allocation_id;
      END IF;
    END IF;
  END LOOP;

  IF v_sale.gift_card_id IS NOT NULL AND v_sale.payment_method = 'gift_card' THEN
    DECLARE
      v_gc_original NUMERIC;
      v_gc_refunded NUMERIC;
    BEGIN
      SELECT COALESCE(ABS(total), 0) INTO v_gc_original FROM sales WHERE id = p_sale_id;
      SELECT COALESCE(SUM(ABS(total)), 0) INTO v_gc_refunded
      FROM sales WHERE original_sale_id = p_sale_id AND is_refund = TRUE;
      IF (v_gc_original - v_gc_refunded) > 0 THEN
        UPDATE gift_cards
        SET balance = LEAST(initial_value, balance + (v_gc_original - v_gc_refunded))
        WHERE id = v_sale.gift_card_id;
      END IF;
    END;
  END IF;

  FOR v_refund_id IN
    SELECT id FROM sales WHERE original_sale_id = p_sale_id AND is_refund = TRUE
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_movements' AND table_schema = 'public') THEN
      DELETE FROM stock_movements WHERE reference_id = v_refund_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_commissions' AND table_schema = 'public') THEN
      DELETE FROM employee_commissions WHERE source_id = v_refund_id AND source_type = 'sale';
    END IF;
    DELETE FROM sales WHERE id = v_refund_id;
  END LOOP;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_movements' AND table_schema = 'public') THEN
    DELETE FROM stock_movements WHERE reference_id = p_sale_id AND type = 'sale';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_commissions' AND table_schema = 'public') THEN
    DELETE FROM employee_commissions WHERE source_id = p_sale_id AND source_type = 'sale';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_serials' AND table_schema = 'public') THEN
    UPDATE inventory_serials SET sale_id = NULL, status = 'in_stock' WHERE sale_id = p_sale_id;
  END IF;

  DELETE FROM sales WHERE id = p_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_sale(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_sale(UUID) TO service_role;
