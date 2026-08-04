-- Migration 098: Move inventory deduction for repair parts from status→'repaired'
-- to repair creation time. Parts are physically pulled from stock when assigned
-- to a ticket, so the deduction should be immediate.

-- ── New function: deduct_repair_parts ────────────────────────────────────────
-- Called right after repair_items are inserted on repair creation.
-- Deducts inventory for every physical part (non-service, has product_id).
-- Allows going negative (alert rather than block the repair workflow).
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
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Update update_repair_status: remove inventory deduction from 'repaired' ──
-- Deduction now happens at creation time (above). Keeping it here would
-- double-deduct stock for all repairs created going forward.
CREATE OR REPLACE FUNCTION update_repair_status(
  p_repair_id  UUID,
  p_new_status TEXT,
  p_note       TEXT,
  p_changed_by UUID
)
RETURNS VOID AS $$
DECLARE
  v_old_status TEXT;
  v_branch_id  UUID;
  v_job_number TEXT;
BEGIN
  SELECT status, branch_id, job_number
    INTO v_old_status, v_branch_id, v_job_number
    FROM repairs
   WHERE id = p_repair_id;

  UPDATE repairs
     SET status       = p_new_status,
         updated_at   = NOW(),
         collected_at = CASE WHEN p_new_status = 'collected' THEN NOW() ELSE collected_at END
   WHERE id = p_repair_id;

  INSERT INTO repair_status_history (repair_id, old_status, new_status, note, changed_by)
  VALUES (p_repair_id, v_old_status, p_new_status, p_note, p_changed_by);

  -- Set warranty_starts_at when repair is marked as repaired
  IF p_new_status = 'repaired' AND v_old_status IS DISTINCT FROM 'repaired' THEN
    UPDATE repair_items
       SET warranty_starts_at = NOW()
     WHERE repair_id = p_repair_id
       AND warranty_days > 0;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
