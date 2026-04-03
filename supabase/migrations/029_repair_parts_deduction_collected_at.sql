-- Migration 029: Deduct repair parts from inventory when repair is marked 'repaired'
-- Also adds collected_at + warranty tracking per plan section 1.10

-- ── Add collected_at to repairs ──────────────────────────────────────────────
ALTER TABLE repairs
  ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- ── Add warranty_starts_at to repair_items (per plan 1.10) ───────────────────
ALTER TABLE repair_items
  ADD COLUMN IF NOT EXISTS warranty_days       INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warranty_starts_at  TIMESTAMPTZ;

-- ── Update update_repair_status: deduct parts on 'repaired', set collected_at ─
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
  v_item       RECORD;
  v_inv_id     UUID;
  v_inv_qty    INT;
BEGIN
  SELECT status, branch_id, job_number
    INTO v_old_status, v_branch_id, v_job_number
    FROM repairs
   WHERE id = p_repair_id;

  -- Update the repair status (and collected_at when collected)
  UPDATE repairs
     SET status       = p_new_status,
         updated_at   = NOW(),
         collected_at = CASE WHEN p_new_status = 'collected' THEN NOW() ELSE collected_at END
   WHERE id = p_repair_id;

  -- Log history
  INSERT INTO repair_status_history (repair_id, old_status, new_status, note, changed_by)
  VALUES (p_repair_id, v_old_status, p_new_status, p_note, p_changed_by);

  -- ── Deduct parts from inventory exactly once: when transitioning TO 'repaired' ──
  -- This ensures parts are consumed the moment the repair is marked complete.
  IF p_new_status = 'repaired' AND v_old_status IS DISTINCT FROM 'repaired' THEN

    -- Set warranty_starts_at on all items with a warranty
    UPDATE repair_items
       SET warranty_starts_at = NOW()
     WHERE repair_id = p_repair_id
       AND warranty_days > 0;

    -- Deduct each physical part (product_id NOT NULL, product is_service = false)
    FOR v_item IN
      SELECT ri.product_id, ri.variant_id, ri.quantity
        FROM repair_items ri
        JOIN products     p  ON p.id = ri.product_id
       WHERE ri.repair_id  = p_repair_id
         AND ri.product_id IS NOT NULL
         AND p.is_service  = false
    LOOP
      -- Find the inventory row for this branch (row-lock to prevent race conditions)
      SELECT id, quantity
        INTO v_inv_id, v_inv_qty
        FROM inventory
       WHERE branch_id  = v_branch_id
         AND product_id = v_item.product_id
         AND (
               variant_id = v_item.variant_id
               OR (variant_id IS NULL AND v_item.variant_id IS NULL)
             )
       FOR UPDATE;

      IF v_inv_id IS NOT NULL THEN
        -- Deduct (allow going negative — alert rather than block the repair workflow)
        UPDATE inventory
           SET quantity   = quantity - v_item.quantity,
               updated_at = NOW()
         WHERE id = v_inv_id;

        -- Log the movement
        INSERT INTO stock_movements (
          branch_id, product_id, variant_id,
          type, quantity, reference_id, note
        )
        VALUES (
          v_branch_id,
          v_item.product_id,
          v_item.variant_id,
          'repair_used',
          -(v_item.quantity),
          p_repair_id,
          'Repair ' || v_job_number
        );
      END IF;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
