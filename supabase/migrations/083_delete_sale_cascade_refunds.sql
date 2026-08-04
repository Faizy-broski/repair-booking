-- ============================================================
-- 083 — delete_sale: cascade-delete refund records + restore only net inventory
-- When deleting a partial/refunded sale:
--   - Inventory restored only for unrefunded items (refunded items already had stock restored)
--   - All associated refund records deleted atomically
-- ============================================================

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
  -- Lock the sale row
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

  -- ── Restore NET inventory BEFORE deleting refund records ──────────────
  -- net_qty = original_qty - already_refunded_qty
  -- (refunded items already had stock restored when refund was processed)
  FOR v_item IN
    SELECT
      si.product_id,
      si.variant_id,
      si.quantity - COALESCE((
        SELECT SUM(ri.quantity)
        FROM sale_items ri
        JOIN sales rs ON rs.id = ri.sale_id
        WHERE rs.original_sale_id = p_sale_id
          AND rs.is_refund = TRUE
          AND ri.name = si.name
      ), 0) AS net_qty
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
    END IF;
  END LOOP;

  -- ── Restore net gift card balance if used ─────────────────────────────
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

  -- ── Delete associated refund records (sale_items CASCADE) ──────────────
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

  -- ── Clean up original sale's linked records ────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_movements' AND table_schema = 'public') THEN
    DELETE FROM stock_movements WHERE reference_id = p_sale_id AND type = 'sale';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_commissions' AND table_schema = 'public') THEN
    DELETE FROM employee_commissions WHERE source_id = p_sale_id AND source_type = 'sale';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_serials' AND table_schema = 'public') THEN
    UPDATE inventory_serials SET sale_id = NULL, status = 'in_stock' WHERE sale_id = p_sale_id;
  END IF;

  -- ── Delete the original sale (sale_items CASCADE) ──────────────────────
  DELETE FROM sales WHERE id = p_sale_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_sale(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_sale(UUID) TO service_role;
