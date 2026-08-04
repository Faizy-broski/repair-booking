-- ============================================================================
-- 056 — Delete Sale: FK fixes + atomic delete_sale function
-- ============================================================================

-- ── 1. Fix orphan-risk FKs ────────────────────────────────────────────────
-- inventory_serials.sale_id had no ON DELETE rule → NULL it when sale deleted
ALTER TABLE inventory_serials
  DROP CONSTRAINT IF EXISTS inventory_serials_sale_id_fkey;
ALTER TABLE inventory_serials
  ADD CONSTRAINT inventory_serials_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;

-- trade_in_transactions.sale_id had no ON DELETE rule → NULL it when sale deleted
ALTER TABLE trade_in_transactions
  DROP CONSTRAINT IF EXISTS trade_in_transactions_sale_id_fkey;
ALTER TABLE trade_in_transactions
  ADD CONSTRAINT trade_in_transactions_sale_id_fkey
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL;

-- sales.original_sale_id (refund links) → NULL it when original sale deleted
ALTER TABLE sales
  DROP CONSTRAINT IF EXISTS sales_original_sale_id_fkey;
ALTER TABLE sales
  ADD CONSTRAINT sales_original_sale_id_fkey
  FOREIGN KEY (original_sale_id) REFERENCES sales(id) ON DELETE SET NULL;

-- ── 2. delete_sale atomic function ───────────────────────────────────────
-- Restores inventory, clears orphaned rows, then deletes the sale.
-- sale_items are removed via ON DELETE CASCADE on sale_items.sale_id.
CREATE OR REPLACE FUNCTION delete_sale(p_sale_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item        RECORD;
  v_sale        RECORD;
BEGIN
  -- Lock the sale row first
  SELECT id, branch_id, is_refund, gift_card_id, payment_method,
         payment_splits
  INTO v_sale
  FROM sales
  WHERE id = p_sale_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found: %', p_sale_id;
  END IF;

  -- Prevent deleting a refund record directly (delete the original instead)
  IF v_sale.is_refund = TRUE THEN
    RAISE EXCEPTION 'Cannot delete a refund record. Delete the original sale or process a reverse manually.';
  END IF;

  -- ── Restore inventory for each non-service line item ──────────────────
  FOR v_item IN
    SELECT si.product_id, si.variant_id, si.quantity
    FROM   sale_items si
    WHERE  si.sale_id = p_sale_id
      AND  si.product_id IS NOT NULL
  LOOP
    UPDATE inventory
    SET    quantity   = quantity + v_item.quantity,
           updated_at = NOW()
    WHERE  branch_id  = v_sale.branch_id
      AND  product_id = v_item.product_id
      AND  (
             variant_id = v_item.variant_id
             OR (variant_id IS NULL AND v_item.variant_id IS NULL)
           );
  END LOOP;

  -- ── Restore gift card balance if one was used ──────────────────────────
  -- payment_splits holds [{"method":"gift_card","amount":X}, ...]
  -- If payment_method = 'gift_card' use the sale total; if split, sum gift_card splits
  IF v_sale.gift_card_id IS NOT NULL THEN
    DECLARE
      v_gc_amount NUMERIC := 0;
      v_split     JSONB;
    BEGIN
      IF v_sale.payment_method = 'gift_card' THEN
        SELECT total INTO v_gc_amount FROM sales WHERE id = p_sale_id;
      ELSE
        -- Sum gift_card portions from payment_splits
        FOR v_split IN SELECT * FROM jsonb_array_elements(v_sale.payment_splits)
        LOOP
          IF (v_split->>'method') = 'gift_card' THEN
            v_gc_amount := v_gc_amount + (v_split->>'amount')::NUMERIC;
          END IF;
        END LOOP;
      END IF;

      IF v_gc_amount > 0 THEN
        UPDATE gift_cards
        SET    balance = LEAST(initial_value, balance + v_gc_amount)
        WHERE  id = v_sale.gift_card_id;
      END IF;
    END;
  END IF;

  -- ── Remove stock movements tied to this sale ───────────────────────────
  DELETE FROM stock_movements
  WHERE  reference_id = p_sale_id
    AND  type = 'sale';

  -- ── Remove employee commissions tied to this sale ──────────────────────
  DELETE FROM employee_commissions
  WHERE  source_id   = p_sale_id
    AND  source_type = 'sale';

  -- ── NULL out serial units that were marked sold via this sale ─────────
  UPDATE inventory_serials
  SET    sale_id = NULL,
         status  = 'in_stock'
  WHERE  sale_id = p_sale_id;

  -- ── NULL out refund records that referenced this sale as original ──────
  UPDATE sales
  SET    original_sale_id = NULL
  WHERE  original_sale_id = p_sale_id;

  -- ── Delete the sale (sale_items removed via CASCADE) ──────────────────
  DELETE FROM sales WHERE id = p_sale_id;
END;
$$;

-- Only service role (backend) can call this — no direct client access
REVOKE ALL ON FUNCTION delete_sale(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_sale(UUID) TO service_role;
