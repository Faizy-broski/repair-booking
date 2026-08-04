-- Stock Batches panel loses a batch's entire history the moment it sells
-- out: consume_cost_layers() hard-deletes the row once quantity hits 0, and
-- stock_movements only logs aggregate quantity deltas (no received_at/
-- unit_cost/original quantity), so nothing else in the schema can
-- reconstruct "batch X, received on date Y, N units at cost Z, now
-- depleted." Not intentional — fixing it here.
--
-- Fix: stop deleting depleted layers — zero them out and stamp depleted_at
-- instead, and add quantity_received so the original batch size survives
-- past quantity hitting 0. Every INSERT into inventory_cost_layers is
-- updated to populate quantity_received; every function keeps its existing
-- behavior otherwise.

ALTER TABLE inventory_cost_layers
  ADD COLUMN IF NOT EXISTS quantity_received INT,
  ADD COLUMN IF NOT EXISTS depleted_at TIMESTAMPTZ;
`
-- Best-effort backfill — a layer already partially consumed before this
-- migration can't have its true original quantity recovered; this just
-- seeds quantity_received with whatever remains today.
UPDATE inventory_cost_layers SET quantity_received = quantity WHERE quantity_received IS NULL;

-- ── consume_cost_layers: zero-out + stamp depleted_at instead of DELETE ──
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
      UPDATE inventory_cost_layers SET quantity = 0, depleted_at = NOW() WHERE id = v_layer.id;
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

-- ── consume_and_freeze_cost: thread quantity_received into the seed insert ──
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
  SELECT COALESCE(p.valuation_method, 'weighted_average'),
         COALESCE(NULLIF(pv.cost_price, 0), NULLIF(p.average_cost, 0), p.cost_price, 0)
    INTO v_valuation, v_fallback
    FROM products p
    LEFT JOIN product_variants pv ON pv.id = p_variant_id
   WHERE p.id = p_product_id;

  IF v_valuation NOT IN ('fifo', 'lifo') THEN
    RETURN v_fallback;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_layer_qty
    FROM inventory_cost_layers
   WHERE product_id = p_product_id AND branch_id = p_branch_id
     AND variant_id IS NOT DISTINCT FROM p_variant_id;

  IF v_layer_qty = 0 AND p_current_on_hand > 0 THEN
    INSERT INTO inventory_cost_layers(product_id, branch_id, variant_id, quantity, quantity_received, unit_cost, received_at, source_type)
    VALUES (p_product_id, p_branch_id, p_variant_id, p_current_on_hand, p_current_on_hand, v_fallback, NOW() - INTERVAL '1 second', 'adjustment');
  END IF;

  v_cost := consume_cost_layers(p_product_id, p_branch_id, p_qty, v_valuation, p_variant_id);
  IF v_cost IS NULL THEN
    v_cost := v_fallback;
  END IF;
  RETURN v_cost;
END;
$$;

-- ── restore_cost_layer: thread quantity_received into the restore insert ──
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
    INSERT INTO inventory_cost_layers(product_id, branch_id, variant_id, quantity, quantity_received, unit_cost, received_at, source_type)
    VALUES (p_product_id, p_branch_id, p_variant_id, p_qty, p_qty, COALESCE(p_unit_cost, 0), NOW(), 'adjustment');
  END IF;
END;
$$;

-- ── process_grn: thread quantity_received into the FIFO/LIFO receipt insert ──
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
        INSERT INTO inventory_cost_layers(product_id, branch_id, variant_id, quantity, quantity_received, unit_cost, received_at, source_id, source_type)
        VALUES (v_poi.product_id, v_grn.branch_id, v_poi.variant_id, v_item.quantity_received, v_item.quantity_received, v_poi.unit_cost,
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

-- ── add_cost_layer_batch: thread quantity_received into the manual-add insert ──
CREATE OR REPLACE FUNCTION add_cost_layer_batch(
  p_branch_id     UUID,
  p_product_id    UUID,
  p_variant_id    UUID,
  p_quantity      INT,
  p_unit_cost     NUMERIC,
  p_selling_price NUMERIC,
  p_note          TEXT,
  p_user_id       UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv_id  UUID;
  v_layer_id UUID;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Batch quantity must be greater than zero';
  END IF;

  SELECT id INTO v_inv_id
    FROM inventory
   WHERE branch_id = p_branch_id AND product_id = p_product_id
     AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL))
   FOR UPDATE;

  IF v_inv_id IS NOT NULL THEN
    UPDATE inventory SET quantity = quantity + p_quantity, updated_at = NOW() WHERE id = v_inv_id;
  ELSE
    INSERT INTO inventory (branch_id, product_id, variant_id, quantity)
    VALUES (p_branch_id, p_product_id, p_variant_id, p_quantity);
  END IF;

  INSERT INTO inventory_cost_layers (product_id, branch_id, variant_id, quantity, quantity_received, unit_cost, selling_price, source_type)
  VALUES (p_product_id, p_branch_id, p_variant_id, p_quantity, p_quantity, COALESCE(p_unit_cost, 0), p_selling_price, 'adjustment')
  RETURNING id INTO v_layer_id;

  INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, note, created_by)
  VALUES (p_branch_id, p_product_id, p_variant_id, 'adjustment', p_quantity, COALESCE(p_note, 'Stock batch added'), p_user_id);

  PERFORM sync_selling_price_from_batches(p_product_id, p_variant_id);

  RETURN v_layer_id;
END;
$$;

-- ── update_cost_layer_batch: keep quantity_received in sync with a manual edit ──
CREATE OR REPLACE FUNCTION update_cost_layer_batch(
  p_layer_id      UUID,
  p_quantity      INT,
  p_unit_cost     NUMERIC,
  p_selling_price NUMERIC,
  p_user_id       UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_layer      inventory_cost_layers%ROWTYPE;
  v_inv_id     UUID;
  v_delta      INT;
BEGIN
  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'Batch quantity cannot be negative';
  END IF;

  SELECT * INTO v_layer FROM inventory_cost_layers WHERE id = p_layer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock batch not found: %', p_layer_id;
  END IF;

  v_delta := p_quantity - v_layer.quantity;

  IF v_delta <> 0 THEN
    SELECT id INTO v_inv_id
      FROM inventory
     WHERE branch_id = v_layer.branch_id AND product_id = v_layer.product_id
       AND (variant_id = v_layer.variant_id OR (variant_id IS NULL AND v_layer.variant_id IS NULL))
     FOR UPDATE;

    IF v_inv_id IS NOT NULL THEN
      UPDATE inventory SET quantity = GREATEST(0, quantity + v_delta), updated_at = NOW() WHERE id = v_inv_id;
    END IF;

    INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, note, created_by)
    VALUES (v_layer.branch_id, v_layer.product_id, v_layer.variant_id, 'adjustment', v_delta, 'Stock batch edited', p_user_id);
  END IF;

  UPDATE inventory_cost_layers
     SET quantity = p_quantity,
         quantity_received = p_quantity,
         depleted_at = CASE WHEN p_quantity > 0 THEN NULL ELSE depleted_at END,
         unit_cost = COALESCE(p_unit_cost, unit_cost),
         selling_price = p_selling_price
   WHERE id = p_layer_id;

  PERFORM sync_selling_price_from_batches(v_layer.product_id, v_layer.variant_id);
END;
$$;
