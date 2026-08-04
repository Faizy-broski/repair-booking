-- ============================================================
-- 135 — delete_repair: restore inventory for consumed parts before delete
-- Repair parts are deducted from inventory at repair creation
-- (see deduct_repair_parts). Deleting a repair previously did a bare
-- `DELETE FROM repairs`, cascading repair_items away with no compensating
-- inventory restore. This mirrors delete_sale's pattern: restore stock,
-- clean up the now-stale stock_movements rows, then delete the repair.
-- ============================================================

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
    SELECT ri.product_id, ri.variant_id, ri.quantity
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
  END LOOP;

  DELETE FROM stock_movements WHERE reference_id = p_repair_id AND type = 'repair_used';

  DELETE FROM repairs WHERE id = p_repair_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_repair(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_repair(UUID, UUID) TO service_role;
