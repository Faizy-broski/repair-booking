-- ============================================================
-- 142 — Payment intent chosen at PO creation, auto-applied on receipt
--
-- Purchase orders currently have no payment fields set until the goods are
-- actually received (record_supplier_payment, migration 121, deliberately
-- rejects payment on anything but status='received' — "nothing is owed
-- before goods arrive"). But the user wants to decide UP FRONT, when
-- creating the PO, whether this purchase will be paid in full (cash/card/
-- bank transfer/cheque) or bought on credit/account — without breaking that
-- existing accounts-payable rule.
--
-- Fix: purchase_orders gains payment_intent, recorded at creation time and
-- otherwise inert. process_grn, at the moment it flips a PO to 'received'
-- (fully received), checks this intent — if it's anything other than
-- 'credit', it auto-calls record_supplier_payment for the full total, using
-- the chosen method. A 'credit' intent (the default) behaves exactly as
-- before: nothing happens automatically, staff use the existing manual
-- "Record Payment" flow whenever they actually pay the supplier.
-- ============================================================

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_intent TEXT NOT NULL DEFAULT 'credit'
  CHECK (payment_intent IN ('credit', 'cash', 'card', 'bank_transfer', 'cheque', 'other'));

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
  v_pay_intent     TEXT;
  v_pay_status     TEXT;
  v_po_total       NUMERIC;
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

  -- If this receipt just fully completed the PO and the user chose an
  -- upfront payment method (not "credit") when creating it, auto-record full
  -- payment now — record_supplier_payment still enforces status='received',
  -- which this UPDATE just set, so the "nothing owed before goods arrive"
  -- rule is preserved; this just removes the need for a manual click when
  -- the intent was already "pay in full".
  IF v_total_received >= v_total_ordered THEN
    SELECT payment_intent, payment_status, total INTO v_pay_intent, v_pay_status, v_po_total
      FROM purchase_orders WHERE id = v_grn.po_id;

    IF v_pay_intent <> 'credit' AND v_pay_status <> 'paid' AND v_po_total > 0 THEN
      PERFORM record_supplier_payment(
        v_grn.po_id, v_po_total, v_pay_intent,
        'Auto-paid on receipt (payment method selected at PO creation)',
        NULL, p_user_id
      );
    END IF;
  END IF;
END;
$$;
