-- ============================================================
-- 145 — Full variant-aware FIFO/LIFO cost layers
--
-- inventory_cost_layers has never had a variant_id column — all variants of
-- a product shared one pooled FIFO/LIFO ledger, and the catch-up-seed logic
-- fell back to products.cost_price (product-level) instead of
-- product_variants.cost_price (the value actually set per variant), so a
-- variant's own cost was never consulted for costing purposes. Confirmed
-- live: a variant with cost_price=20 produced a Rs 0/unit Stock Batches
-- entry because the product-level cost_price was 0.
--
-- Fix: add variant_id to inventory_cost_layers and thread p_variant_id
-- through every function that reads/writes it. Strict
-- `variant_id IS NOT DISTINCT FROM p_variant_id` matching throughout (no
-- cross-variant fallback — see plan for why). Every caller already has
-- variant_id in scope at its cost-layer call site; this is purely "thread
-- the value that's already there," not new data plumbing. Scales to any
-- number of variants — each variant's layers/seeds/consumption are
-- completely independent rows filtered by that variant's own UUID.
-- ============================================================

ALTER TABLE inventory_cost_layers ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cost_layers_product_branch_variant ON inventory_cost_layers(product_id, branch_id, variant_id);

-- ── consume_cost_layers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION consume_cost_layers(
  p_product_id UUID,
  p_branch_id  UUID,
  p_qty        INT,
  p_method     TEXT DEFAULT 'fifo',
  p_variant_id UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_layer        inventory_cost_layers%ROWTYPE;
  v_remaining    INT := p_qty;
  v_total_cost   NUMERIC := 0;
  v_consumed_qty INT := 0;
  v_take         INT;
  v_order        TEXT;
BEGIN
  v_order := CASE WHEN lower(p_method) = 'lifo' THEN 'DESC' ELSE 'ASC' END;

  FOR v_layer IN
    EXECUTE format(
      'SELECT * FROM inventory_cost_layers
        WHERE product_id = $1 AND branch_id = $2 AND quantity > 0
          AND variant_id IS NOT DISTINCT FROM $3
        ORDER BY received_at %s', v_order
    ) USING p_product_id, p_branch_id, p_variant_id
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_layer.quantity);
    v_total_cost   := v_total_cost + (v_take * v_layer.unit_cost);
    v_consumed_qty := v_consumed_qty + v_take;
    v_remaining    := v_remaining - v_take;

    IF v_take >= v_layer.quantity THEN
      DELETE FROM inventory_cost_layers WHERE id = v_layer.id;
    ELSE
      UPDATE inventory_cost_layers
         SET quantity = quantity - v_take
       WHERE id = v_layer.id;
    END IF;
  END LOOP;

  IF v_consumed_qty = 0 THEN
    RETURN NULL;
  END IF;
  RETURN v_total_cost / v_consumed_qty;
END;
$$;

-- ── consume_and_freeze_cost ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION consume_and_freeze_cost(
  p_product_id      UUID,
  p_branch_id       UUID,
  p_qty             INT,
  p_current_on_hand INT,
  p_variant_id      UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_valuation  TEXT;
  v_fallback   NUMERIC;
  v_layer_qty  INT;
  v_cost       NUMERIC;
BEGIN
  -- Prefer the variant's own cost_price when one is set; average_cost DEFAULTs
  -- to 0 (not NULL) so NULLIF treats that unset-zero as "no real average yet."
  SELECT COALESCE(p.valuation_method, 'weighted_average'),
         COALESCE(NULLIF(pv.cost_price, 0), NULLIF(p.average_cost, 0), p.cost_price, 0)
    INTO v_valuation, v_fallback
    FROM products p
    LEFT JOIN product_variants pv ON pv.id = p_variant_id
   WHERE p.id = p_product_id;

  IF v_valuation NOT IN ('fifo', 'lifo') THEN
    -- Weighted-average products don't draw down individual batches — the
    -- blended average_cost (kept correct by update_average_cost() on every
    -- receipt) already represents the right cost to freeze. Stays
    -- product-level even for variant products (see plan's stated limitation).
    RETURN v_fallback;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_layer_qty
    FROM inventory_cost_layers
   WHERE product_id = p_product_id AND branch_id = p_branch_id
     AND variant_id IS NOT DISTINCT FROM p_variant_id;

  IF v_layer_qty = 0 AND p_current_on_hand > 0 THEN
    INSERT INTO inventory_cost_layers(product_id, branch_id, variant_id, quantity, unit_cost, received_at, source_type)
    VALUES (p_product_id, p_branch_id, p_variant_id, p_current_on_hand, v_fallback, NOW() - INTERVAL '1 second', 'adjustment');
  END IF;

  v_cost := consume_cost_layers(p_product_id, p_branch_id, p_qty, v_valuation, p_variant_id);
  IF v_cost IS NULL THEN
    v_cost := v_fallback;
  END IF;
  RETURN v_cost;
END;
$$;

-- ── restore_cost_layer ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION restore_cost_layer(
  p_product_id UUID,
  p_branch_id  UUID,
  p_qty        INT,
  p_unit_cost  NUMERIC,
  p_variant_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_product_id IS NOT NULL AND p_qty > 0 THEN
    INSERT INTO inventory_cost_layers(product_id, branch_id, variant_id, quantity, unit_cost, received_at, source_type)
    VALUES (p_product_id, p_branch_id, p_variant_id, p_qty, COALESCE(p_unit_cost, 0), NOW(), 'adjustment');
  END IF;
END;
$$;

-- ── apply_inventory_adjustment ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION apply_inventory_adjustment(
  p_branch_id  UUID,
  p_product_id UUID,
  p_variant_id UUID,
  p_delta      INT,
  p_note       TEXT,
  p_user_id    UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv_id      UUID;
  v_current_qty INT;
  v_fallback    NUMERIC;
BEGIN
  SELECT id, quantity INTO v_inv_id, v_current_qty
    FROM inventory
   WHERE branch_id = p_branch_id AND product_id = p_product_id
     AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL))
   FOR UPDATE;

  IF v_inv_id IS NOT NULL THEN
    UPDATE inventory SET quantity = quantity + p_delta, updated_at = NOW() WHERE id = v_inv_id;
  ELSE
    INSERT INTO inventory (branch_id, product_id, variant_id, quantity)
    VALUES (p_branch_id, p_product_id, p_variant_id, GREATEST(0, p_delta));
  END IF;

  IF p_delta > 0 THEN
    SELECT COALESCE(NULLIF(pv.cost_price, 0), NULLIF(p.average_cost, 0), p.cost_price, 0) INTO v_fallback
    FROM products p LEFT JOIN product_variants pv ON pv.id = p_variant_id
    WHERE p.id = p_product_id;
    INSERT INTO inventory_cost_layers (product_id, branch_id, variant_id, quantity, unit_cost, source_type)
    VALUES (p_product_id, p_branch_id, p_variant_id, p_delta, v_fallback, 'adjustment');
  ELSIF p_delta < 0 THEN
    PERFORM consume_and_freeze_cost(p_product_id, p_branch_id, ABS(p_delta), COALESCE(v_current_qty, 0), p_variant_id);
  END IF;

  INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, note, created_by)
  VALUES (p_branch_id, p_product_id, p_variant_id, 'adjustment', p_delta, p_note, p_user_id);
END;
$$;

-- ── process_sale: thread variant_id into consume_and_freeze_cost ────────
CREATE OR REPLACE FUNCTION process_sale(p_sale_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_sale_id            UUID;
  v_sale_item_id       UUID;
  v_item               JSONB;
  v_inventory_id       UUID;
  v_current_qty        INT;
  v_unit_cost          NUMERIC;
  v_payment_method     TEXT;
  v_amount_paid        NUMERIC;
  v_total              NUMERIC;
  v_payment_status     TEXT;
  v_repair_id          UUID;
  v_is_discount        BOOLEAN;
  v_discount_id        UUID;
  v_discount_remaining INT;
  v_original_price     NUMERIC;
BEGIN
  v_payment_method := COALESCE(p_sale_data->>'payment_method', 'cash');
  v_total          := (p_sale_data->>'total')::NUMERIC;
  v_amount_paid    := COALESCE((p_sale_data->>'amount_paid')::NUMERIC, 0);

  IF v_payment_method = 'on_account' THEN
    IF v_amount_paid <= 0 THEN
      v_payment_status := 'on_account';
    ELSIF v_amount_paid >= v_total THEN
      v_payment_status := 'paid';
    ELSE
      v_payment_status := 'partial';
    END IF;
  ELSE
    v_payment_status := 'paid';
  END IF;

  INSERT INTO sales (
    branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_status, amount_paid,
    payment_splits, gift_card_id, notes, employee_id
  )
  VALUES (
    (p_sale_data->>'branch_id')::UUID,
    NULLIF(p_sale_data->>'customer_id', '')::UUID,
    NULLIF(p_sale_data->>'cashier_id', '')::UUID,
    (p_sale_data->>'subtotal')::NUMERIC,
    COALESCE((p_sale_data->>'discount')::NUMERIC, 0),
    COALESCE((p_sale_data->>'tax')::NUMERIC, 0),
    v_total,
    v_payment_method,
    v_payment_status,
    v_amount_paid,
    COALESCE(p_sale_data->'payment_splits', '[]'::jsonb),
    NULLIF(p_sale_data->>'gift_card_id', '')::UUID,
    p_sale_data->>'notes',
    NULLIF(p_sale_data->>'employee_id', '')::UUID
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_data->'items')
  LOOP
    v_repair_id   := NULLIF(v_item->>'repair_id', '')::UUID;
    v_unit_cost   := 0;
    v_is_discount := COALESCE((v_item->>'is_discount')::BOOLEAN, false);

    INSERT INTO sale_items (
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, repair_id
    )
    VALUES (
      v_sale_id,
      CASE WHEN v_repair_id IS NOT NULL THEN NULL ELSE NULLIF(v_item->>'product_id', '')::UUID END,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      COALESCE((v_item->>'discount')::NUMERIC, 0),
      (v_item->>'total')::NUMERIC,
      v_repair_id
    )
    RETURNING id INTO v_sale_item_id;

    IF (v_item->>'is_service')::BOOLEAN IS NOT TRUE AND v_repair_id IS NULL THEN
      SELECT id, quantity INTO v_inventory_id, v_current_qty
      FROM inventory
      WHERE branch_id = (p_sale_data->>'branch_id')::UUID
        AND product_id = NULLIF(v_item->>'product_id', '')::UUID
        AND (
          variant_id = NULLIF(v_item->>'variant_id', '')::UUID
          OR (variant_id IS NULL AND NULLIF(v_item->>'variant_id', '') IS NULL)
        )
      FOR UPDATE;

      IF v_inventory_id IS NOT NULL THEN
        IF v_current_qty < (v_item->>'quantity')::INT THEN
          RAISE EXCEPTION 'Insufficient stock for product: %', v_item->>'name';
        END IF;

        SELECT id, quantity_remaining INTO v_discount_id, v_discount_remaining
        FROM product_discount_allocations
        WHERE product_id = NULLIF(v_item->>'product_id', '')::UUID
          AND branch_id  = (p_sale_data->>'branch_id')::UUID
          AND (
            variant_id = NULLIF(v_item->>'variant_id', '')::UUID
            OR (variant_id IS NULL AND NULLIF(v_item->>'variant_id', '') IS NULL)
          )
          AND status = 'active'
        FOR UPDATE;

        IF v_is_discount THEN
          IF v_discount_id IS NULL OR v_discount_remaining < (v_item->>'quantity')::INT THEN
            RAISE EXCEPTION 'Insufficient discounted stock for product: %', v_item->>'name';
          END IF;
        ELSE
          IF v_current_qty - (v_item->>'quantity')::INT < COALESCE(v_discount_remaining, 0) THEN
            RAISE EXCEPTION 'Insufficient normal stock for product: % (units reserved for discount)', v_item->>'name';
          END IF;
        END IF;

        v_unit_cost := consume_and_freeze_cost(
          NULLIF(v_item->>'product_id', '')::UUID,
          (p_sale_data->>'branch_id')::UUID,
          (v_item->>'quantity')::INT,
          v_current_qty,
          NULLIF(v_item->>'variant_id', '')::UUID
        );

        UPDATE inventory
        SET quantity = quantity - (v_item->>'quantity')::INT, updated_at = NOW()
        WHERE id = v_inventory_id;
        INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, reference_id, note)
        VALUES (
          (p_sale_data->>'branch_id')::UUID,
          NULLIF(v_item->>'product_id', '')::UUID,
          NULLIF(v_item->>'variant_id', '')::UUID,
          'sale', -((v_item->>'quantity')::INT), v_sale_id, 'POS Sale'
        );

        UPDATE sale_items SET unit_cost = v_unit_cost WHERE id = v_sale_item_id;

        IF v_is_discount THEN
          SELECT COALESCE(pv.selling_price, p.selling_price) INTO v_original_price
          FROM products p
          LEFT JOIN product_variants pv ON pv.id = NULLIF(v_item->>'variant_id', '')::UUID
          WHERE p.id = NULLIF(v_item->>'product_id', '')::UUID;

          UPDATE sale_items SET original_unit_price = v_original_price WHERE id = v_sale_item_id;

          UPDATE product_discount_allocations
          SET quantity_remaining = quantity_remaining - (v_item->>'quantity')::INT,
              status   = CASE WHEN quantity_remaining - (v_item->>'quantity')::INT <= 0 THEN 'ended' ELSE 'active' END,
              ended_at = CASE WHEN quantity_remaining - (v_item->>'quantity')::INT <= 0 THEN NOW() ELSE ended_at END
          WHERE id = v_discount_id;

          UPDATE sale_items SET discount_allocation_id = v_discount_id WHERE id = v_sale_item_id;
        END IF;
      END IF;
    END IF;
  END LOOP;

  IF p_sale_data->>'gift_card_id' IS NOT NULL AND p_sale_data->>'gift_card_amount' IS NOT NULL THEN
    UPDATE gift_cards
    SET balance = balance - (p_sale_data->>'gift_card_amount')::NUMERIC
    WHERE id = (p_sale_data->>'gift_card_id')::UUID
      AND balance >= (p_sale_data->>'gift_card_amount')::NUMERIC;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient gift card balance';
    END IF;
  END IF;

  IF NULLIF(p_sale_data->>'customer_id', '') IS NOT NULL AND p_sale_data->>'store_credit_amount' IS NOT NULL
     AND (p_sale_data->>'store_credit_amount')::NUMERIC > 0 THEN
    PERFORM apply_store_credit(
      (SELECT b.business_id FROM branches b WHERE b.id = (p_sale_data->>'branch_id')::UUID),
      NULLIF(p_sale_data->>'customer_id', '')::UUID,
      (p_sale_data->>'store_credit_amount')::NUMERIC,
      'POS sale payment',
      v_sale_id,
      'sale'
    );
  END IF;

  IF NULLIF(p_sale_data->>'customer_id', '') IS NOT NULL AND p_sale_data->>'loyalty_points_used' IS NOT NULL
     AND (p_sale_data->>'loyalty_points_used')::INT > 0 THEN
    PERFORM apply_loyalty_redeem(
      (SELECT b.business_id FROM branches b WHERE b.id = (p_sale_data->>'branch_id')::UUID),
      NULLIF(p_sale_data->>'customer_id', '')::UUID,
      (p_sale_data->>'loyalty_points_used')::INT,
      v_sale_id,
      'sale'
    );
  END IF;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── process_refund: thread variant_id into restore_cost_layer ───────────
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
        v_item_cost,
        NULLIF(v_item->>'variant_id', '')::UUID
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

      INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, reference_id, note)
      VALUES (
        (p_refund_data->>'branch_id')::UUID,
        NULLIF(v_item->>'product_id', '')::UUID,
        NULLIF(v_item->>'variant_id', '')::UUID,
        'return', (v_item->>'quantity')::INT, v_refund_id, 'POS Refund'
      );
    END IF;
  END LOOP;

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

-- ── process_exchange: thread variant_id into restore_cost_layer + consume_and_freeze_cost ──
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
        (v_item->>'quantity')::INT, v_item_cost,
        (v_item->>'variant_id')::UUID
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
          (v_item->>'quantity')::INT, v_inv.quantity,
          (v_item->>'variant_id')::UUID
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

  SELECT COALESCE(SUM(ABS(total)), 0) INTO v_total_refunded
  FROM sales
  WHERE original_sale_id = v_sale.id AND is_refund = true;

  IF v_total_refunded >= v_sale.total THEN
    UPDATE sales SET payment_status = 'refunded' WHERE id = v_sale.id;
  ELSIF v_total_refunded > 0 THEN
    UPDATE sales SET payment_status = 'partial'  WHERE id = v_sale.id;
  END IF;

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

-- ── delete_sale: thread variant_id into restore_cost_layer ──────────────
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

      PERFORM restore_cost_layer(v_item.product_id, v_sale.branch_id, v_item.net_qty, v_item.unit_cost, v_item.variant_id);

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

-- ── deduct_repair_parts: thread variant_id into consume_and_freeze_cost ──
CREATE OR REPLACE FUNCTION deduct_repair_parts(
  p_repair_id  UUID,
  p_branch_id  UUID
)
RETURNS VOID AS $$
DECLARE
  v_job_number TEXT;
  v_item       RECORD;
  v_inv_id     UUID;
  v_inv_qty    INT;
  v_unit_cost  NUMERIC;
BEGIN
  SELECT job_number INTO v_job_number FROM repairs WHERE id = p_repair_id;

  FOR v_item IN
    SELECT ri.id, ri.product_id, ri.variant_id, ri.quantity
      FROM repair_items ri
      JOIN products     p  ON p.id = ri.product_id
     WHERE ri.repair_id  = p_repair_id
       AND ri.product_id IS NOT NULL
       AND p.is_service  = false
  LOOP
    SELECT id, quantity INTO v_inv_id, v_inv_qty
      FROM inventory
     WHERE branch_id  = p_branch_id
       AND product_id = v_item.product_id
       AND (
             variant_id = v_item.variant_id
             OR (variant_id IS NULL AND v_item.variant_id IS NULL)
           )
     FOR UPDATE;

    v_unit_cost := consume_and_freeze_cost(
      v_item.product_id, p_branch_id, v_item.quantity, COALESCE(v_inv_qty, 0), v_item.variant_id
    );

    IF v_inv_id IS NOT NULL THEN
      UPDATE inventory
         SET quantity   = quantity - v_item.quantity,
             updated_at = NOW()
       WHERE id = v_inv_id;
    ELSE
      INSERT INTO inventory (branch_id, product_id, variant_id, quantity, low_stock_alert)
      VALUES (p_branch_id, v_item.product_id, v_item.variant_id, -v_item.quantity, 5);
    END IF;

    UPDATE repair_items SET unit_cost = v_unit_cost WHERE id = v_item.id;

    INSERT INTO stock_movements (
      branch_id, product_id, variant_id,
      type, quantity, reference_id, note
    )
    VALUES (
      p_branch_id,
      v_item.product_id,
      v_item.variant_id,
      'repair_used',
      -(v_item.quantity),
      p_repair_id,
      'Repair ' || v_job_number
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── delete_repair: thread variant_id into restore_cost_layer ────────────
CREATE OR REPLACE FUNCTION delete_repair(p_repair_id UUID, p_branch_id UUID DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_repair RECORD;
  v_item   RECORD;
  v_inv_id UUID;
BEGIN
  SELECT id, branch_id
  INTO v_repair
  FROM repairs
  WHERE id = p_repair_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Repair not found: %', p_repair_id;
  END IF;

  FOR v_item IN
    SELECT ri.product_id, ri.variant_id, ri.quantity, ri.unit_cost
      FROM repair_items ri
      JOIN products     p  ON p.id = ri.product_id
     WHERE ri.repair_id  = p_repair_id
       AND ri.product_id IS NOT NULL
       AND p.is_service  = false
  LOOP
    SELECT id INTO v_inv_id
      FROM inventory
     WHERE branch_id  = v_repair.branch_id
       AND product_id = v_item.product_id
       AND (
             variant_id = v_item.variant_id
             OR (variant_id IS NULL AND v_item.variant_id IS NULL)
           )
     FOR UPDATE;

    IF v_inv_id IS NOT NULL THEN
      UPDATE inventory
         SET quantity   = quantity + v_item.quantity,
             updated_at = NOW()
       WHERE id = v_inv_id;
    ELSE
      INSERT INTO inventory (branch_id, product_id, variant_id, quantity, low_stock_alert)
      VALUES (v_repair.branch_id, v_item.product_id, v_item.variant_id, v_item.quantity, 5);
    END IF;

    PERFORM restore_cost_layer(v_item.product_id, v_repair.branch_id, v_item.quantity, v_item.unit_cost, v_item.variant_id);
  END LOOP;

  DELETE FROM stock_movements WHERE reference_id = p_repair_id AND type = 'repair_used';

  DELETE FROM repairs WHERE id = p_repair_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_repair(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_repair(UUID, UUID) TO service_role;

-- ── process_grn: thread variant_id into the FIFO/LIFO cost-layer INSERT ──
CREATE OR REPLACE FUNCTION process_grn(p_grn_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_grn            goods_receiving_notes%ROWTYPE;
  v_item           grn_items%ROWTYPE;
  v_poi            purchase_order_items%ROWTYPE;
  v_total_ordered  INT;
  v_total_received INT;
  v_valuation      TEXT;
  v_inv_id         UUID;
BEGIN
  SELECT * INTO v_grn FROM goods_receiving_notes WHERE id = p_grn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRN not found'; END IF;

  FOR v_item IN SELECT * FROM grn_items WHERE grn_id = p_grn_id LOOP
    SELECT * INTO v_poi FROM purchase_order_items WHERE id = v_item.po_item_id;

    UPDATE purchase_order_items
       SET quantity_received = quantity_received + v_item.quantity_received
     WHERE id = v_item.po_item_id;

    IF v_poi.product_id IS NOT NULL AND v_item.quantity_received > 0 THEN
      SELECT id INTO v_inv_id
        FROM inventory
       WHERE branch_id = v_grn.branch_id AND product_id = v_poi.product_id
         AND (variant_id = v_poi.variant_id OR (variant_id IS NULL AND v_poi.variant_id IS NULL))
       FOR UPDATE;

      IF v_inv_id IS NOT NULL THEN
        UPDATE inventory
           SET quantity = quantity + v_item.quantity_received, updated_at = NOW()
         WHERE id = v_inv_id;
      ELSE
        INSERT INTO inventory(branch_id, product_id, variant_id, quantity, low_stock_alert)
        VALUES (v_grn.branch_id, v_poi.product_id, v_poi.variant_id, v_item.quantity_received, 5);
      END IF;

      INSERT INTO stock_movements(branch_id, product_id, variant_id, type, quantity, reference_id, note, created_by)
      VALUES (v_grn.branch_id, v_poi.product_id, v_poi.variant_id, 'purchase', v_item.quantity_received,
              p_grn_id, 'GRN receipt', p_user_id);

      SELECT COALESCE(valuation_method, 'weighted_average') INTO v_valuation
        FROM products WHERE id = v_poi.product_id;

      IF v_valuation = 'weighted_average' THEN
        PERFORM update_average_cost(v_poi.product_id, v_item.quantity_received, v_poi.unit_cost);

      ELSIF v_valuation IN ('fifo', 'lifo') THEN
        INSERT INTO inventory_cost_layers(product_id, branch_id, variant_id, quantity, unit_cost, received_at, source_id, source_type)
        VALUES (v_poi.product_id, v_grn.branch_id, v_poi.variant_id, v_item.quantity_received, v_poi.unit_cost,
                NOW(), p_grn_id, 'grn');
      END IF;
    END IF;
  END LOOP;

  SELECT SUM(quantity_ordered), SUM(quantity_received)
    INTO v_total_ordered, v_total_received
    FROM purchase_order_items
   WHERE po_id = v_grn.po_id;

  UPDATE purchase_orders
     SET status = CASE
           WHEN v_total_received >= v_total_ordered THEN 'received'
           WHEN v_total_received > 0               THEN 'in_progress'
           ELSE status
         END,
         updated_at = NOW()
   WHERE id = v_grn.po_id;
END;
$$;
