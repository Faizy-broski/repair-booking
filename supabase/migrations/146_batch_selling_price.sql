-- ============================================================
-- 146 — User-managed stock batches with per-batch selling price
--
-- inventory_cost_layers has always been cost-only (populated automatically
-- by GRN receiving / adjustments / trade-ins) and the Edit page only showed
-- it as a read-only "Stock Batches" panel. This migration lets users
-- directly create/edit/delete batches — each with its own quantity, cost
-- price, AND selling price — for FIFO-valuation products and their
-- variants.
--
-- POS and the inventory list read price from the flat products.selling_price
-- / product_variants.selling_price columns and are not being changed here.
-- Instead, every batch mutation re-syncs those flat columns to the price of
-- the OLDEST remaining batch (the one that sells next under FIFO), so the
-- rest of the app keeps working unchanged while always showing the
-- FIFO-correct current price. LIFO/weighted-average products are untouched
-- — this feature is scoped to FIFO only.
-- ============================================================

ALTER TABLE inventory_cost_layers ADD COLUMN IF NOT EXISTS selling_price NUMERIC(10,2);

-- ── sync_selling_price_from_batches ──────────────────────────────────────
-- No-ops for non-FIFO products. Otherwise pushes the oldest remaining
-- batch's selling_price onto products.selling_price (product-level) or
-- product_variants.selling_price (variant-level).
CREATE OR REPLACE FUNCTION sync_selling_price_from_batches(
  p_product_id UUID,
  p_variant_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_valuation TEXT;
  v_price     NUMERIC;
BEGIN
  SELECT COALESCE(valuation_method, 'weighted_average') INTO v_valuation
    FROM products WHERE id = p_product_id;
  IF v_valuation <> 'fifo' THEN
    RETURN;
  END IF;

  SELECT selling_price INTO v_price
    FROM inventory_cost_layers
   WHERE product_id = p_product_id
     AND variant_id IS NOT DISTINCT FROM p_variant_id
     AND quantity > 0
     AND selling_price IS NOT NULL
   ORDER BY received_at ASC
   LIMIT 1;

  IF v_price IS NULL THEN
    RETURN;
  END IF;

  IF p_variant_id IS NULL THEN
    UPDATE products SET selling_price = v_price WHERE id = p_product_id;
  ELSE
    UPDATE product_variants SET selling_price = v_price WHERE id = p_variant_id;
  END IF;
END;
$$;

-- ── add_cost_layer_batch ─────────────────────────────────────────────────
-- Same locking/atomicity shape as apply_inventory_adjustment (145): locks
-- (or seeds) the inventory row, applies +p_quantity, inserts the batch,
-- logs a stock_movements adjustment, then re-syncs the display price.
CREATE OR REPLACE FUNCTION add_cost_layer_batch(
  p_branch_id     UUID,
  p_product_id    UUID,
  p_variant_id    UUID,
  p_quantity      INT,
  p_unit_cost     NUMERIC,
  p_selling_price NUMERIC,
  p_note          TEXT,
  p_user_id       UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_inv_id  UUID;
  v_layer_id UUID;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Batch quantity must be greater than zero';
  END IF;

  SELECT id INTO v_inv_id
    FROM inventory
   WHERE branch_id = p_branch_id AND product_id = p_product_id
     AND (variant_id = p_variant_id OR (variant_id IS NULL AND p_variant_id IS NULL))
   FOR UPDATE;

  IF v_inv_id IS NOT NULL THEN
    UPDATE inventory SET quantity = quantity + p_quantity, updated_at = NOW() WHERE id = v_inv_id;
  ELSE
    INSERT INTO inventory (branch_id, product_id, variant_id, quantity)
    VALUES (p_branch_id, p_product_id, p_variant_id, p_quantity);
  END IF;

  INSERT INTO inventory_cost_layers (product_id, branch_id, variant_id, quantity, unit_cost, selling_price, source_type)
  VALUES (p_product_id, p_branch_id, p_variant_id, p_quantity, COALESCE(p_unit_cost, 0), p_selling_price, 'adjustment')
  RETURNING id INTO v_layer_id;

  INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, note, created_by)
  VALUES (p_branch_id, p_product_id, p_variant_id, 'adjustment', p_quantity, COALESCE(p_note, 'Stock batch added'), p_user_id);

  PERFORM sync_selling_price_from_batches(p_product_id, p_variant_id);

  RETURN v_layer_id;
END;
$$;

-- ── update_cost_layer_batch ──────────────────────────────────────────────
-- Quantity is an absolute value (matches how the batch-manager UI edits a
-- row in place); the delta between old and new quantity is what actually
-- moves inventory.quantity and gets logged as a stock_movements adjustment.
CREATE OR REPLACE FUNCTION update_cost_layer_batch(
  p_layer_id      UUID,
  p_quantity      INT,
  p_unit_cost     NUMERIC,
  p_selling_price NUMERIC,
  p_user_id       UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_layer      inventory_cost_layers%ROWTYPE;
  v_inv_id     UUID;
  v_delta      INT;
BEGIN
  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'Batch quantity cannot be negative';
  END IF;

  SELECT * INTO v_layer FROM inventory_cost_layers WHERE id = p_layer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock batch not found: %', p_layer_id;
  END IF;

  v_delta := p_quantity - v_layer.quantity;

  IF v_delta <> 0 THEN
    SELECT id INTO v_inv_id
      FROM inventory
     WHERE branch_id = v_layer.branch_id AND product_id = v_layer.product_id
       AND (variant_id = v_layer.variant_id OR (variant_id IS NULL AND v_layer.variant_id IS NULL))
     FOR UPDATE;

    IF v_inv_id IS NOT NULL THEN
      UPDATE inventory SET quantity = GREATEST(0, quantity + v_delta), updated_at = NOW() WHERE id = v_inv_id;
    END IF;

    INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, note, created_by)
    VALUES (v_layer.branch_id, v_layer.product_id, v_layer.variant_id, 'adjustment', v_delta, 'Stock batch edited', p_user_id);
  END IF;

  UPDATE inventory_cost_layers
     SET quantity = p_quantity,
         unit_cost = COALESCE(p_unit_cost, unit_cost),
         selling_price = p_selling_price
   WHERE id = p_layer_id;

  PERFORM sync_selling_price_from_batches(v_layer.product_id, v_layer.variant_id);
END;
$$;

-- ── delete_cost_layer_batch ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_cost_layer_batch(
  p_layer_id UUID,
  p_user_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_layer  inventory_cost_layers%ROWTYPE;
  v_inv_id UUID;
BEGIN
  SELECT * INTO v_layer FROM inventory_cost_layers WHERE id = p_layer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock batch not found: %', p_layer_id;
  END IF;

  SELECT id INTO v_inv_id
    FROM inventory
   WHERE branch_id = v_layer.branch_id AND product_id = v_layer.product_id
     AND (variant_id = v_layer.variant_id OR (variant_id IS NULL AND v_layer.variant_id IS NULL))
   FOR UPDATE;

  IF v_inv_id IS NOT NULL THEN
    UPDATE inventory SET quantity = GREATEST(0, quantity - v_layer.quantity), updated_at = NOW() WHERE id = v_inv_id;
  END IF;

  INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, note, created_by)
  VALUES (v_layer.branch_id, v_layer.product_id, v_layer.variant_id, 'adjustment', -v_layer.quantity, 'Stock batch removed', p_user_id);

  DELETE FROM inventory_cost_layers WHERE id = p_layer_id;

  PERFORM sync_selling_price_from_batches(v_layer.product_id, v_layer.variant_id);
END;
$$;

REVOKE ALL ON FUNCTION add_cost_layer_batch(UUID, UUID, UUID, INT, NUMERIC, NUMERIC, TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION add_cost_layer_batch(UUID, UUID, UUID, INT, NUMERIC, NUMERIC, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION update_cost_layer_batch(UUID, INT, NUMERIC, NUMERIC, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION update_cost_layer_batch(UUID, INT, NUMERIC, NUMERIC, UUID) TO service_role;

REVOKE ALL ON FUNCTION delete_cost_layer_batch(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_cost_layer_batch(UUID, UUID) TO service_role;
