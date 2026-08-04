-- ============================================================
-- 136 — True lot-level FIFO/LIFO costing across the stock lifecycle
--
-- Problem: products.cost_price/average_cost are single mutable fields, and
-- every COGS/profit calculation live-joined to whatever that field is RIGHT
-- NOW. Receiving a new $10 batch and editing cost after previously selling
-- $5-cost stock silently restated the historical profit of those earlier
-- sales, because sale_items stored no cost at all.
--
-- Fix: sale_items.unit_cost freezes the true cost of what was actually sold,
-- at the moment it was sold, sourced from inventory_cost_layers (per-batch
-- cost rows already written by GRN receiving, migration 031) consumed
-- oldest-first (FIFO) or newest-first (LIFO) via the existing
-- consume_cost_layers() function. Every stock-increasing action across the
-- app now writes a cost layer (not just GRN); every stock-decreasing action
-- that represents a real sale/use now consumes layers and freezes the
-- result; every reversal (delete/refund/exchange-return) re-creates a layer
-- at the ORIGINAL frozen cost, never at today's cost.
--
-- Non-disruptive by construction: no existing row is rewritten. Historical
-- sale_items keep unit_cost = 0 and reporting falls back to the live
-- products.cost_price join for those rows only (identical output to today).
-- Only sales made after this migration get frozen, tamper-proof cost.
-- ============================================================

-- ── Schema ──────────────────────────────────────────────────────────────────

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(10,2) DEFAULT 0;

-- consume_cost_layers (redefined here): the original (migration 017) returned
-- a plain 0 both when it genuinely consumed a free ($0-cost) layer AND when
-- it consumed nothing at all — those are different situations (a real free
-- unit vs. "no layers existed"), and callers need to tell them apart. Now
-- returns NULL for "nothing was consumed" so a genuine $0 result never gets
-- confused with an empty layer table.
CREATE OR REPLACE FUNCTION consume_cost_layers(
  p_product_id UUID,
  p_branch_id  UUID,
  p_qty        INT,
  p_method     TEXT DEFAULT 'fifo'
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
        ORDER BY received_at %s', v_order
    ) USING p_product_id, p_branch_id
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

-- ── Shared helpers ──────────────────────────────────────────────────────────

-- consume_and_freeze_cost: the single place every stock-decrease-that-means-
-- a-sale (POS sale, repair part, exchange new item) goes through to get a
-- true FIFO/LIFO cost.
--
-- Concurrency note: the "catch-up seed" below (for a product that has never
-- had a cost layer — e.g. it predates this migration, or was only ever
-- stocked via product-creation/manual-adjustment before those paths wrote
-- layers) MUST be called from inside the caller's existing
-- `SELECT ... FOR UPDATE` lock on the relevant `inventory` row, with
-- p_current_on_hand passed in from that same locked read (not re-queried
-- here). That ordering is what prevents two concurrent sales of a
-- never-seeded product from each seeding a duplicate catch-up layer and
-- double-counting stock value — the second transaction blocks on the
-- inventory row lock and, once it proceeds, sees the layer the first
-- transaction already created.
CREATE OR REPLACE FUNCTION consume_and_freeze_cost(
  p_product_id      UUID,
  p_branch_id       UUID,
  p_qty             INT,
  p_current_on_hand INT
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_valuation  TEXT;
  v_fallback   NUMERIC;
  v_layer_qty  INT;
  v_cost       NUMERIC;
BEGIN
  -- average_cost DEFAULTs to 0 (not NULL) in the schema — NULLIF treats that
  -- unset-zero as "no real average yet" so we fall back to cost_price, same
  -- as every product that's never been through a GRN receipt.
  SELECT COALESCE(valuation_method, 'weighted_average'), COALESCE(NULLIF(average_cost, 0), cost_price, 0)
    INTO v_valuation, v_fallback
    FROM products WHERE id = p_product_id;

  IF v_valuation NOT IN ('fifo', 'lifo') THEN
    -- Weighted-average products don't draw down individual batches — the
    -- blended average_cost (kept correct by update_average_cost() on every
    -- receipt) already represents the right cost to freeze.
    RETURN v_fallback;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_layer_qty
    FROM inventory_cost_layers
   WHERE product_id = p_product_id AND branch_id = p_branch_id;

  IF v_layer_qty = 0 AND p_current_on_hand > 0 THEN
    INSERT INTO inventory_cost_layers(product_id, branch_id, quantity, unit_cost, received_at, source_type)
    VALUES (p_product_id, p_branch_id, p_current_on_hand, v_fallback, NOW() - INTERVAL '1 second', 'adjustment');
  END IF;

  v_cost := consume_cost_layers(p_product_id, p_branch_id, p_qty, v_valuation);
  IF v_cost IS NULL THEN
    v_cost := v_fallback;
  END IF;
  RETURN v_cost;
END;
$$;

-- restore_cost_layer: the single place every reversal (sale/repair delete,
-- refund, exchange return) goes through to put stock back. Restocks at the
-- ORIGINAL frozen cost of the unit(s) being reversed, never at whatever
-- cost is current today.
--
-- Accepted smoothing: when a multi-batch sale is reversed, the reversed
-- unit(s) go back in as a single layer at the SALE'S blended unit_cost
-- (e.g. 2 @ $10 + 1 @ $20 sold together freezes at $13.33/unit), not
-- necessarily the exact original batch a specific physical unit came from
-- — line-item granularity doesn't track which literal unit within a
-- multi-batch line was returned. This is standard practice for line-item
-- (not serial-level) inventory accounting; serialized products already
-- have separate per-unit identity via inventory_serials, independent of
-- this cost-layer system.
CREATE OR REPLACE FUNCTION restore_cost_layer(
  p_product_id UUID,
  p_branch_id  UUID,
  p_qty        INT,
  p_unit_cost  NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_product_id IS NOT NULL AND p_qty > 0 THEN
    INSERT INTO inventory_cost_layers(product_id, branch_id, quantity, unit_cost, received_at, source_type)
    VALUES (p_product_id, p_branch_id, p_qty, COALESCE(p_unit_cost, 0), NOW(), 'adjustment');
  END IF;
END;
$$;

-- ── apply_inventory_adjustment: atomic replacement for InventoryService.adjustStock's
-- previous separate SELECT+UPDATE/INSERT calls. A negative manual adjustment
-- (shrinkage/breakage) now correctly CONSUMES a cost layer via
-- consume_and_freeze_cost, matching a real sale — previously only positive
-- adjustments touched inventory_cost_layers at all, so a shrinkage write-off
-- left physical stock and the cost ledger permanently out of sync (a phantom
-- layer unit that a later sale would silently draw from).
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
    SELECT COALESCE(NULLIF(average_cost, 0), cost_price, 0) INTO v_fallback FROM products WHERE id = p_product_id;
    INSERT INTO inventory_cost_layers (product_id, branch_id, quantity, unit_cost, source_type)
    VALUES (p_product_id, p_branch_id, p_delta, v_fallback, 'adjustment');
  ELSIF p_delta < 0 THEN
    PERFORM consume_and_freeze_cost(p_product_id, p_branch_id, ABS(p_delta), COALESCE(v_current_qty, 0));
  END IF;

  INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, note, created_by)
  VALUES (p_branch_id, p_product_id, p_variant_id, 'adjustment', p_delta, p_note, p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION apply_inventory_adjustment(UUID, UUID, UUID, INT, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION apply_inventory_adjustment(UUID, UUID, UUID, INT, TEXT, UUID) TO service_role;

-- ── process_sale: consume layers, freeze unit_cost on each sale_items row ──

CREATE OR REPLACE FUNCTION process_sale(p_sale_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_sale_id        UUID;
  v_sale_item_id   UUID;
  v_item           JSONB;
  v_inventory_id   UUID;
  v_current_qty    INT;
  v_unit_cost      NUMERIC;
  v_payment_method TEXT;
  v_amount_paid    NUMERIC;
  v_total          NUMERIC;
  v_payment_status TEXT;
  v_repair_id      UUID;
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
    v_repair_id := NULLIF(v_item->>'repair_id', '')::UUID;
    v_unit_cost := 0;

    INSERT INTO sale_items (
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, repair_id
    )
    VALUES (
      v_sale_id,
      -- A repair-job line item never has a row in `products` — never write
      -- its (repair) id into product_id, regardless of what the client sent.
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

        v_unit_cost := consume_and_freeze_cost(
          NULLIF(v_item->>'product_id', '')::UUID,
          (p_sale_data->>'branch_id')::UUID,
          (v_item->>'quantity')::INT,
          v_current_qty
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

-- ── deduct_repair_parts: consume layers, freeze repair_items.unit_cost ─────
-- unit_cost was previously client-supplied from the repair form; it is now
-- server-computed from the same cost-layer pool POS sales draw from, so
-- repairs and retail sales never disagree about what a part actually cost.

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
      v_item.product_id, p_branch_id, v_item.quantity, COALESCE(v_inv_qty, 0)
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

-- ── process_refund: restock returned items at their ORIGINAL frozen cost ──

CREATE OR REPLACE FUNCTION process_refund(p_refund_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_refund_id    UUID;
  v_item         JSONB;
  v_original_id  UUID;
  v_orig_qty     INT;
  v_refunded_qty INT;
  v_all_refunded BOOLEAN;
  v_item_cost    NUMERIC;
BEGIN
  v_original_id := NULLIF(p_refund_data->>'original_sale_id', '')::UUID;

  -- Lock the original sale for the remainder of this transaction — without
  -- this, two concurrent refunds of the same sale (double-click, or two
  -- staff refunding it from different terminals at once) can both read the
  -- same "remaining quantity" before either commits, both pass validation,
  -- and both succeed: a real over-refund and double-restock. Matches the
  -- FOR UPDATE pattern already used by process_exchange and delete_sale on
  -- this same table — process_refund was the one function missing it.
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
    v_item_cost := NULL;
    IF v_original_id IS NOT NULL THEN
      SELECT si.unit_cost INTO v_item_cost
      FROM sale_items si
      WHERE si.sale_id = v_original_id AND si.name = v_item->>'name'
      LIMIT 1;
    END IF;

    INSERT INTO sale_items (
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, unit_cost
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
      v_item_cost
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

-- ── process_exchange: restock returns at frozen cost, freeze new-item cost ─
-- Restructured so sale_items rows for both the refund and exchange legs are
-- inserted per-item (inside the same loops that already validate/restock/
-- deduct), each carrying its own unit_cost — the parent `sales` rows are
-- created with placeholder totals before their loops run (required for the
-- sale_items FK) and patched with the real totals once each loop completes.

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
    SELECT si.quantity, si.unit_cost INTO v_orig_qty, v_item_cost
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

    INSERT INTO sale_items (sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, unit_cost)
    VALUES (
      v_refund_id,
      (v_item->>'product_id')::UUID,
      (v_item->>'variant_id')::UUID,
      v_item->>'name',
      -((v_item->>'quantity')::INT),
      (v_item->>'unit_price')::NUMERIC,
      0,
      -((v_item->>'total')::NUMERIC),
      v_item_cost
    );

    v_returned_ttl := v_returned_ttl + (v_item->>'total')::NUMERIC;
  END LOOP;

  UPDATE sales SET subtotal = -v_returned_ttl, total = -v_returned_ttl WHERE id = v_refund_id;

  -- ── Step 2: Validate stock, deduct + freeze cost for new items ────────────
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

-- ── delete_sale: restock removed sale items at their frozen cost ───────────

CREATE OR REPLACE FUNCTION delete_sale(p_sale_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item        RECORD;
  v_sale        RECORD;
  v_refund_id   UUID;
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

-- ── delete_repair: restock removed repair parts at their frozen cost ───────

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

    PERFORM restore_cost_layer(v_item.product_id, v_repair.branch_id, v_item.quantity, v_item.unit_cost);
  END LOOP;

  DELETE FROM stock_movements WHERE reference_id = p_repair_id AND type = 'repair_used';

  DELETE FROM repairs WHERE id = p_repair_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_repair(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_repair(UUID, UUID) TO service_role;

-- ── complete_inventory_count: seed a cost layer on a positive variance ─────

CREATE OR REPLACE FUNCTION complete_inventory_count(p_count_id UUID, p_adjusted_by UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_branch_id UUID;
  v_business_id UUID;
  r RECORD;
BEGIN
  SELECT branch_id, business_id INTO v_branch_id, v_business_id
    FROM inventory_counts WHERE id = p_count_id;

  FOR r IN
    SELECT ci.product_id,
           ci.counted_qty,
           ci.system_qty,
           (ci.counted_qty - ci.system_qty) AS variance
      FROM inventory_count_items ci
     WHERE ci.count_id = p_count_id
       AND ci.counted_qty IS NOT NULL
       AND ci.counted_qty != ci.system_qty
  LOOP
    INSERT INTO inventory (product_id, branch_id, quantity, updated_at)
    VALUES (r.product_id, v_branch_id, r.counted_qty, NOW())
    ON CONFLICT (product_id, branch_id)
    DO UPDATE SET quantity = r.counted_qty, updated_at = NOW();

    -- A count doesn't capture a new purchase cost — extra units found are
    -- seeded at the product's current best-known cost (an estimate, not an
    -- actual receipt), so they still have a layer to be consumed from.
    IF r.variance > 0 THEN
      INSERT INTO inventory_cost_layers (product_id, branch_id, quantity, unit_cost, received_at, source_type)
      SELECT r.product_id, v_branch_id, r.variance, COALESCE(NULLIF(average_cost, 0), cost_price, 0), NOW(), 'adjustment'
      FROM products WHERE id = r.product_id;
    END IF;

    INSERT INTO stock_movements (product_id, branch_id, quantity, type, reference_type, notes, created_by)
    VALUES (
      r.product_id, v_branch_id,
      r.variance,
      CASE WHEN r.variance > 0 THEN 'in' ELSE 'out' END,
      'count_adjustment',
      'Inventory count adjustment',
      p_adjusted_by
    );
  END LOOP;

  UPDATE inventory_counts
     SET status = 'completed', completed_at = NOW()
   WHERE id = p_count_id;
END;
$$;

-- ── update_average_cost: fix double-counting of the just-arrived batch ─────
-- Every caller (process_grn, the trade-in flow) increments inventory.quantity
-- BEFORE calling this function, so the "current quantity" this function reads
-- from `inventory` already INCLUDES the new batch. The original formula
-- treated that post-receipt total as if it were the pre-existing quantity —
-- double-counting the new stock (once as "prior," once as "new") and
-- silently diluting average_cost on every single receipt. This matters even
-- for FIFO-only shops: average_cost is the fallback cost this migration's
-- catch-up-seed logic uses whenever a product's dedicated cost layers run
-- dry, so a wrong average_cost here would eventually feed a wrong FIFO seed.
CREATE OR REPLACE FUNCTION update_average_cost(p_product_id UUID, p_new_qty INT, p_new_cost NUMERIC)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_qty     INT; -- post-receipt total, as read from inventory (already includes p_new_qty)
  v_prior_qty     INT;
  v_current_cost  NUMERIC;
BEGIN
  SELECT COALESCE(SUM(i.quantity), 0) INTO v_total_qty
    FROM inventory i WHERE i.product_id = p_product_id;

  v_prior_qty := GREATEST(v_total_qty - p_new_qty, 0);

  SELECT COALESCE(average_cost, 0) INTO v_current_cost
    FROM products WHERE id = p_product_id;

  IF v_total_qty > 0 THEN
    UPDATE products
       SET average_cost = ((v_prior_qty * v_current_cost) + (p_new_qty * p_new_cost))
                           / v_total_qty
     WHERE id = p_product_id;
  END IF;
END;
$$;

-- ── get_profit_loss: read frozen unit_cost, fall back to live cost_price ───
-- only for pre-migration sales that never got a frozen cost (unit_cost=0).

CREATE OR REPLACE FUNCTION get_profit_loss(
  p_branch_id  UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_revenue      NUMERIC := 0;
  v_repairs      NUMERIC := 0;
  v_cogs         NUMERIC := 0;
  v_repair_cogs  NUMERIC := 0;
  v_expenses     NUMERIC := 0;
  v_salaries     NUMERIC := 0;
  v_cash_net     NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(total),0)
  INTO v_revenue
  FROM sales
  WHERE branch_id = p_branch_id
    AND payment_status != 'refunded'
    AND created_at::date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(COALESCE(actual_cost, estimated_cost, 0)),0)
  INTO v_repairs
  FROM repairs
  WHERE branch_id = p_branch_id
    AND (
      LOWER(status) IN ('repaired','collected','unrepairable','completed','done','fixed','closed','picked_up','handover')
      OR LOWER(status) LIKE '%complet%' OR LOWER(status) LIKE '%pick%' OR LOWER(status) LIKE '%collect%'
    )
    AND updated_at::date BETWEEN p_start_date AND p_end_date;

  -- COGS: frozen sale_items.unit_cost when present (post-migration sales);
  -- falls back to the live products.cost_price join only for historical
  -- sales that predate this migration (unit_cost still the column default
  -- of 0) — those keep reporting exactly what they always have.
  SELECT COALESCE(SUM(si.quantity * COALESCE(NULLIF(si.unit_cost, 0), p.cost_price, 0)), 0)
  INTO v_cogs
  FROM sale_items si
  JOIN sales s           ON s.id = si.sale_id
  JOIN products p        ON p.id = si.product_id
  WHERE s.branch_id = p_branch_id
    AND s.payment_status != 'refunded'
    AND s.created_at::date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(ri.quantity * COALESCE(ri.unit_cost, 0)), 0)
  INTO v_repair_cogs
  FROM repair_items ri
  JOIN repairs r ON r.id = ri.repair_id
  WHERE r.branch_id = p_branch_id
    AND (
      LOWER(r.status) IN ('repaired','collected','unrepairable','completed','done','fixed','closed','picked_up','handover')
      OR LOWER(r.status) LIKE '%complet%' OR LOWER(r.status) LIKE '%pick%' OR LOWER(r.status) LIKE '%collect%'
    )
    AND r.updated_at::date BETWEEN p_start_date AND p_end_date;

  v_cogs := v_cogs + v_repair_cogs;

  SELECT COALESCE(SUM(amount),0)
  INTO v_expenses
  FROM expenses
  WHERE branch_id = p_branch_id
    AND expense_date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(amount),0)
  INTO v_salaries
  FROM salaries
  WHERE branch_id = p_branch_id
    AND pay_date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount ELSE -amount END), 0)
  INTO v_cash_net
  FROM cash_movements
  WHERE branch_id = p_branch_id
    AND created_at::date BETWEEN p_start_date AND p_end_date;

  RETURN jsonb_build_object(
    'revenue',        v_revenue,
    'repair_revenue', v_repairs,
    'other_income',   v_cash_net,
    'total_revenue',  v_revenue + v_repairs + v_cash_net,
    'cogs',           v_cogs,
    'expenses',       v_expenses,
    'salaries',       v_salaries,
    'total_costs',    v_cogs + v_expenses + v_salaries,
    'gross_profit',   (v_revenue + v_repairs) - v_cogs,
    'net_profit',     (v_revenue + v_repairs + v_cash_net) - v_cogs - v_expenses - v_salaries
  );
END;
$$;
