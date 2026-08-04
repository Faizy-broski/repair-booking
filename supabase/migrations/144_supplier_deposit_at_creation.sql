-- ============================================================
-- 144 — Allow an upfront supplier deposit at PO creation time
--
-- Reverts 142's "payment_intent auto-pays in full on receipt" approach —
-- what the user actually needed was a real deposit (any amount, not
-- necessarily the full total) paid to the supplier when PLACING the order,
-- before anything is received. record_supplier_payment (121) deliberately
-- rejected any payment until status='received' ("nothing owed before goods
-- arrive") — too strict for a real upfront deposit, so that guard is relaxed
-- here to allow payment at any status except 'cancelled'. This mirrors the
-- existing deposit_paid pattern already used for repairs/credit sales
-- elsewhere in this app (pay something now, settle the rest later).
-- ============================================================

CREATE OR REPLACE FUNCTION record_supplier_payment(
  p_po_id       UUID,
  p_amount      NUMERIC,
  p_method      TEXT,
  p_note        TEXT DEFAULT NULL,
  p_business_id UUID DEFAULT NULL,
  p_created_by  UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_total       NUMERIC;
  v_paid        NUMERIC;
  v_new_paid    NUMERIC;
  v_new_status  TEXT;
  v_supplier_id UUID;
  v_status      TEXT;
BEGIN
  SELECT total, amount_paid, supplier_id, status
  INTO v_total, v_paid, v_supplier_id, v_status
  FROM purchase_orders
  WHERE id = p_po_id
    AND payment_status != 'paid'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found or already fully paid';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot record a payment against a cancelled purchase order';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  v_new_paid := v_paid + p_amount;

  IF v_new_paid > v_total + 0.01 THEN
    RAISE EXCEPTION 'Payment of % exceeds outstanding balance of %', p_amount, (v_total - v_paid);
  END IF;

  v_new_paid := LEAST(v_new_paid, v_total);

  IF v_new_paid >= v_total THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partial';
  END IF;

  UPDATE purchase_orders
  SET amount_paid = v_new_paid,
      payment_status = v_new_status,
      updated_at = NOW()
  WHERE id = p_po_id;

  INSERT INTO supplier_payments (business_id, supplier_id, purchase_order_id, amount, method, note, created_by)
  VALUES (
    COALESCE(p_business_id, (SELECT business_id FROM purchase_orders WHERE id = p_po_id)),
    v_supplier_id, p_po_id, p_amount, p_method, p_note, p_created_by
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── process_grn: revert the payment_intent auto-pay-on-receipt logic added
-- in 142 — deposits are now handled directly at creation/anytime via
-- record_supplier_payment instead, so this goes back to exactly its
-- 141 form.
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
        INSERT INTO inventory_cost_layers(product_id, branch_id, quantity, unit_cost, received_at, source_id, source_type)
        VALUES (v_poi.product_id, v_grn.branch_id, v_item.quantity_received, v_poi.unit_cost,
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
