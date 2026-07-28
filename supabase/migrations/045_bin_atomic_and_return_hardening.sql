-- ── Bin — make the move/restore write atomic ─────────────────────────────────
-- bin.service.ts previously did this as three separate REST calls (read
-- inventory qty, update inventory, insert stock_movements, insert bin_items)
-- with no shared transaction. Two production-shaped problems with that:
--   1. Lost update: two concurrent "Move to Bin" calls for the same product
--      could both read the same starting quantity before either had written
--      it back, over-decrementing (or worse, going negative) once both writes
--      landed.
--   2. Partial failure: a crash/error between the inventory update and the
--      bin_items insert leaves stock quietly gone from the shop floor with no
--      Bin record to explain where it went.
-- Moving the whole thing into a single plpgsql function fixes both — it's one
-- transaction (all-or-nothing), and the inventory decrement is a single
-- conditional `UPDATE ... WHERE quantity >= X`, which Postgres serializes
-- against every other writer of that row (not just other Bin calls), the
-- same pattern used for ship_supplier_return.

CREATE OR REPLACE FUNCTION move_item_to_bin(
  p_business_id UUID,
  p_branch_id   UUID,
  p_product_id  UUID,
  p_variant_id  UUID,
  p_quantity    INT,
  p_reason      TEXT,
  p_user_id     UUID
)
RETURNS bin_items
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_name      TEXT;
  v_sku       TEXT;
  v_unit_cost NUMERIC(10,2);
  v_new_qty   INT;
  v_item      bin_items%ROWTYPE;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  SELECT name, sku, cost_price INTO v_name, v_sku, v_unit_cost
  FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  IF p_variant_id IS NOT NULL THEN
    DECLARE
      v_variant_name TEXT;
      v_variant_sku  TEXT;
      v_variant_cost NUMERIC(10,2);
    BEGIN
      SELECT name, sku, cost_price INTO v_variant_name, v_variant_sku, v_variant_cost
      FROM product_variants WHERE id = p_variant_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Variant not found'; END IF;
      v_name := v_name || ' — ' || v_variant_name;
      v_sku  := COALESCE(v_variant_sku, v_sku);
      v_unit_cost := COALESCE(v_variant_cost, v_unit_cost);
    END;
  END IF;

  UPDATE inventory
  SET quantity = quantity - p_quantity, updated_at = NOW()
  WHERE branch_id = p_branch_id AND product_id = p_product_id
    AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL))
    AND quantity >= p_quantity
  RETURNING quantity INTO v_new_qty;

  IF NOT FOUND THEN
    SELECT quantity INTO v_new_qty FROM inventory
    WHERE branch_id = p_branch_id AND product_id = p_product_id
      AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL));
    RAISE EXCEPTION 'Only % unit(s) available — cannot move % to the Bin.', COALESCE(v_new_qty, 0), p_quantity;
  END IF;

  INSERT INTO stock_movements(branch_id, product_id, variant_id, type, quantity, note, created_by)
  VALUES (p_branch_id, p_product_id, p_variant_id, 'adjustment', -p_quantity,
          CASE WHEN p_reason IS NOT NULL AND p_reason <> '' THEN 'Moved to Bin: ' || p_reason ELSE 'Moved to Bin' END,
          p_user_id);

  INSERT INTO bin_items(business_id, branch_id, product_id, variant_id, name, sku, quantity, unit_cost, reason, status, binned_by)
  VALUES (p_business_id, p_branch_id, p_product_id, p_variant_id, v_name, v_sku, p_quantity,
          COALESCE(v_unit_cost, 0), NULLIF(p_reason, ''), 'binned', p_user_id)
  RETURNING * INTO v_item;

  RETURN v_item;
END;
$$;

-- Restoring an item is likewise wrapped atomically. Locking the bin_items row
-- with `FOR UPDATE ... WHERE status = 'binned'` is what prevents a double
-- restore (two concurrent Restore clicks on the same row): the loser blocks
-- until the winner commits, then re-checks status against the now-committed
-- ('restored') row and correctly finds nothing to restore.
CREATE OR REPLACE FUNCTION restore_bin_item(
  p_id        UUID,
  p_branch_id UUID,
  p_user_id   UUID
)
RETURNS bin_items
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item    bin_items%ROWTYPE;
  v_inv_id  UUID;
  v_updated bin_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM bin_items
  WHERE id = p_id AND branch_id = p_branch_id AND status = 'binned'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bin item not found or already restored';
  END IF;

  -- Advisory lock scoped to this inventory line, guarding the "no existing
  -- row, so INSERT one" branch below against a concurrent writer doing the
  -- same for the same branch+product+variant (e.g. a second restore of a
  -- different bin_items row for the same product, or a supplier-return
  -- cancel touching the same line) regardless of what unique constraint (if
  -- any) inventory actually has.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_branch_id::text || ':' || v_item.product_id::text || ':' || COALESCE(v_item.variant_id::text, 'null'), 0));

  UPDATE inventory
  SET quantity = quantity + v_item.quantity, updated_at = NOW()
  WHERE branch_id = p_branch_id AND product_id = v_item.product_id
    AND (variant_id = v_item.variant_id OR (variant_id IS NULL AND v_item.variant_id IS NULL))
  RETURNING id INTO v_inv_id;

  IF NOT FOUND THEN
    INSERT INTO inventory(branch_id, product_id, variant_id, quantity)
    VALUES (p_branch_id, v_item.product_id, v_item.variant_id, v_item.quantity);
  END IF;

  INSERT INTO stock_movements(branch_id, product_id, variant_id, type, quantity, note, created_by)
  VALUES (p_branch_id, v_item.product_id, v_item.variant_id, 'adjustment', v_item.quantity, 'Restored from Bin', p_user_id);

  UPDATE bin_items
  SET status = 'restored', restored_by = p_user_id, restored_at = NOW()
  WHERE id = p_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;
