-- ============================================================
-- 031  GRN Valuation Integration
-- Updates process_grn to:
--   - Insert inventory_cost_layers for FIFO/LIFO products
--   - Call update_average_cost for weighted_average products
-- ============================================================

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
BEGIN
  SELECT * INTO v_grn FROM goods_receiving_notes WHERE id = p_grn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRN not found'; END IF;

  FOR v_item IN SELECT * FROM grn_items WHERE grn_id = p_grn_id LOOP
    SELECT * INTO v_poi FROM purchase_order_items WHERE id = v_item.po_item_id;

    -- Update received qty on PO item
    UPDATE purchase_order_items
       SET quantity_received = quantity_received + v_item.quantity_received
     WHERE id = v_item.po_item_id;

    IF v_poi.product_id IS NOT NULL AND v_item.quantity_received > 0 THEN
      -- Increment inventory (upsert)
      INSERT INTO inventory(branch_id, product_id, quantity, low_stock_alert)
      VALUES (v_grn.branch_id, v_poi.product_id, v_item.quantity_received, 5)
      ON CONFLICT (branch_id, product_id)
        DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity;

      -- Log stock movement
      INSERT INTO stock_movements(branch_id, product_id, type, quantity, reference_id, note, created_by)
      VALUES (v_grn.branch_id, v_poi.product_id, 'purchase', v_item.quantity_received,
              p_grn_id, 'GRN receipt', p_user_id);

      -- Valuation
      SELECT COALESCE(valuation_method, 'weighted_average') INTO v_valuation
        FROM products WHERE id = v_poi.product_id;

      IF v_valuation = 'weighted_average' THEN
        PERFORM update_average_cost(v_poi.product_id, v_item.quantity_received, v_poi.unit_cost);

      ELSIF v_valuation IN ('fifo', 'lifo') THEN
        -- Insert cost layer (FIFO uses oldest first, LIFO uses newest first — tracked by received_at)
        INSERT INTO inventory_cost_layers(product_id, branch_id, quantity, unit_cost, received_at, source_id, source_type)
        VALUES (v_poi.product_id, v_grn.branch_id, v_item.quantity_received, v_poi.unit_cost,
                NOW(), p_grn_id, 'grn');
      END IF;
    END IF;
  END LOOP;

  -- Update PO status
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


-- ── consume_cost_layers ────────────────────────────────────────────────────
-- Deducts qty from cost layers in FIFO or LIFO order.
-- Called when a product is sold or used in a repair.
-- Returns weighted average cost of consumed units (for COGS calculation).

CREATE OR REPLACE FUNCTION consume_cost_layers(
  p_product_id UUID,
  p_branch_id  UUID,
  p_qty        INT,
  p_method     TEXT DEFAULT 'fifo'  -- 'fifo' or 'lifo'
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_layer        inventory_cost_layers%ROWTYPE;
  v_remaining    INT := p_qty;
  v_total_cost   NUMERIC := 0;
  v_take         INT;
  v_order        TEXT;
BEGIN
  -- FIFO: oldest first (ASC); LIFO: newest first (DESC)
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
    v_total_cost := v_total_cost + (v_take * v_layer.unit_cost);
    v_remaining  := v_remaining - v_take;

    IF v_take >= v_layer.quantity THEN
      DELETE FROM inventory_cost_layers WHERE id = v_layer.id;
    ELSE
      UPDATE inventory_cost_layers
         SET quantity = quantity - v_take
       WHERE id = v_layer.id;
    END IF;
  END LOOP;

  -- Return average unit cost of consumed qty
  IF p_qty > v_remaining THEN
    RETURN v_total_cost / (p_qty - v_remaining);
  END IF;
  RETURN 0;
END;
$$;
