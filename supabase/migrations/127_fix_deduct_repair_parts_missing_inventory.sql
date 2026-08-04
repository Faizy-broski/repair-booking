-- Migration 127: Fix deduct_repair_parts silently skipping parts that have
-- no inventory row yet for the active branch. Previously the function only
-- decremented stock when a matching `inventory` row already existed; parts
-- picked from the catalogue that had never been stocked at that branch (on_hand
-- defaults to 0 rather than being excluded — see ProductService.list) were
-- silently skipped: no stock change, no stock_movements row, no error.
-- Now it upserts: decrement if a row exists, otherwise create one going
-- negative (the function already allows negative stock by design).

CREATE OR REPLACE FUNCTION deduct_repair_parts(
  p_repair_id  UUID,
  p_branch_id  UUID
)
RETURNS VOID AS $$
DECLARE
  v_job_number TEXT;
  v_item       RECORD;
  v_inv_id     UUID;
BEGIN
  SELECT job_number INTO v_job_number FROM repairs WHERE id = p_repair_id;

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
     WHERE branch_id  = p_branch_id
       AND product_id = v_item.product_id
       AND (
             variant_id = v_item.variant_id
             OR (variant_id IS NULL AND v_item.variant_id IS NULL)
           )
     FOR UPDATE;

    IF v_inv_id IS NOT NULL THEN
      UPDATE inventory
         SET quantity   = quantity - v_item.quantity,
             updated_at = NOW()
       WHERE id = v_inv_id;
    ELSE
      INSERT INTO inventory (branch_id, product_id, variant_id, quantity, low_stock_alert)
      VALUES (p_branch_id, v_item.product_id, v_item.variant_id, -v_item.quantity, 5);
    END IF;

    INSERT INTO stock_movements (
      branch_id, product_id, variant_id,
      type, quantity, reference_id, note
    )
    VALUES (
      p_branch_id,
      v_item.product_id,
      v_item.variant_id,
      'repair_used',
      -(v_item.quantity),
      p_repair_id,
      'Repair ' || v_job_number
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
