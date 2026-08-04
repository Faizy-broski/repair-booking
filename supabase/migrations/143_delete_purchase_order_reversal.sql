-- ============================================================
-- 143 — Allow deleting a Purchase Order at any status, reversing its effects
--
-- Previously PurchaseOrderService.remove only allowed deleting draft/pending/
-- cancelled POs — once anything was received, deletion was blocked outright
-- to protect the inventory/cost/payment history tied to it. The user wants
-- Delete always available instead, with a real reversal: any inventory this
-- PO's GRN(s) added gets subtracted back out, the cost layers/stock
-- movements those GRNs created get removed, and any supplier_payments record
-- (paid or partial) gets deleted along with the PO — a full undo, not just
-- removing the paper trail.
--
-- Known, accepted limitation: for weighted-average valuation products,
-- update_average_cost blends a running average that can't be cleanly
-- un-blended if other receipts have happened since — average_cost is left
-- as-is (same category of accepted imprecision as the legacy pooled-layer
-- tradeoff documented in the variant-FIFO follow-up plan). FIFO/LIFO cost
-- layers ARE exactly reversible since they're tagged with this GRN's own id.
-- ============================================================

CREATE OR REPLACE FUNCTION delete_purchase_order(p_po_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_po      RECORD;
  v_grn     RECORD;
  v_item    RECORD;
  v_inv_id  UUID;
BEGIN
  SELECT id, branch_id INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found: %', p_po_id;
  END IF;

  FOR v_grn IN SELECT id FROM goods_receiving_notes WHERE po_id = p_po_id LOOP
    FOR v_item IN
      SELECT gi.quantity_received, poi.product_id, poi.variant_id
      FROM grn_items gi
      JOIN purchase_order_items poi ON poi.id = gi.po_item_id
      WHERE gi.grn_id = v_grn.id
    LOOP
      IF v_item.product_id IS NOT NULL AND v_item.quantity_received > 0 THEN
        -- Lock and reverse the specific (product, variant) inventory row this
        -- GRN incremented. Not floor-clamped at 0 — if some of this stock was
        -- already sold elsewhere, going negative here is the honest signal
        -- that the physical count no longer reconciles, same as other
        -- reversal paths in this codebase (e.g. deduct_repair_parts) already
        -- allow.
        SELECT id INTO v_inv_id FROM inventory
         WHERE branch_id = v_po.branch_id AND product_id = v_item.product_id
           AND (variant_id = v_item.variant_id OR (variant_id IS NULL AND v_item.variant_id IS NULL))
         FOR UPDATE;

        IF v_inv_id IS NOT NULL THEN
          UPDATE inventory
             SET quantity = quantity - v_item.quantity_received, updated_at = NOW()
           WHERE id = v_inv_id;
        END IF;

        -- Remove exactly the cost layer(s) this GRN created — tagged with
        -- source_type/source_id at insert time in process_grn, so this is an
        -- exact reversal, not a guess (product-pooled only; no variant_id on
        -- inventory_cost_layers yet — see the variant-FIFO follow-up plan).
        DELETE FROM inventory_cost_layers
         WHERE source_type = 'grn' AND source_id = v_grn.id AND product_id = v_item.product_id;
      END IF;
    END LOOP;

    DELETE FROM stock_movements WHERE reference_id = v_grn.id AND type = 'purchase';
  END LOOP;

  -- goods_receiving_notes -> grn_items cascades (ON DELETE CASCADE, 016).
  DELETE FROM goods_receiving_notes WHERE po_id = p_po_id;

  -- purchase_orders -> purchase_order_items and supplier_payments both
  -- cascade (ON DELETE CASCADE, 016 / 121) — any recorded supplier payment
  -- is removed along with the order, per explicit choice to "reset all
  -- values" regardless of payment_status. If real money was actually paid
  -- to the supplier, that payment is no longer tracked anywhere in this app
  -- once this PO is deleted.
  DELETE FROM purchase_orders WHERE id = p_po_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_purchase_order(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_purchase_order(UUID) TO service_role;
