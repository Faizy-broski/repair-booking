-- ============================================================
-- 141 — Purchase Order / GRN product+variant linking fix
--
-- Two confirmed live bugs:
--  1. The "New PO" UI never set purchase_order_items.product_id, so
--     process_grn's `IF v_poi.product_id IS NOT NULL` guard skipped
--     receiving entirely — GRN receipts for UI-created POs updated neither
--     inventory quantity nor cost. (Fixed on the TS/UI side alongside this
--     migration — see supply-chain.service.ts / purchase-orders pages.)
--  2. process_grn's inventory upsert only ever supplied (branch_id,
--     product_id) — for a variant-tracked product this always bumped the
--     variant_id IS NULL pooled row instead of the specific variant actually
--     received. Fixed here by adding purchase_order_items.variant_id and
--     threading it through process_grn's inventory/stock_movements writes,
--     using the same SELECT ... FOR UPDATE + branch INSERT/UPDATE pattern
--     apply_inventory_adjustment already uses (NOT "ON CONFLICT
--     (branch_id, product_id, variant_id)" — a plain UNIQUE constraint with
--     a nullable column doesn't catch conflicts among NULL-variant rows,
--     which is exactly why 077_inventory_performance_indexes.sql needed a
--     separate partial unique index for the base-product case).
--
-- Cost layers stay product-pooled for now (intentionally out of scope —
-- see the deferred variant-aware-FIFO plan); only stock QUANTITY becomes
-- variant-correct here.
-- ============================================================

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);

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

    -- Update received qty on PO item
    UPDATE purchase_order_items
       SET quantity_received = quantity_received + v_item.quantity_received
     WHERE id = v_item.po_item_id;

    IF v_poi.product_id IS NOT NULL AND v_item.quantity_received > 0 THEN
      -- Lock the target (product, variant) inventory row before upserting —
      -- prevents a concurrent sale draining the same variant from racing
      -- with this receipt. Same NULL-safe variant match + explicit
      -- INSERT-or-UPDATE branch apply_inventory_adjustment already uses.
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

      -- Log stock movement
      INSERT INTO stock_movements(branch_id, product_id, variant_id, type, quantity, reference_id, note, created_by)
      VALUES (v_grn.branch_id, v_poi.product_id, v_poi.variant_id, 'purchase', v_item.quantity_received,
              p_grn_id, 'GRN receipt', p_user_id);

      -- Valuation (still product-pooled — variant-aware cost layers are a
      -- separate, deferred follow-up)
      SELECT COALESCE(valuation_method, 'weighted_average') INTO v_valuation
        FROM products WHERE id = v_poi.product_id;

      IF v_valuation = 'weighted_average' THEN
        PERFORM update_average_cost(v_poi.product_id, v_item.quantity_received, v_poi.unit_cost);

      ELSIF v_valuation IN ('fifo', 'lifo') THEN
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
