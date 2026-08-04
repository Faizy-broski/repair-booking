-- ============================================================
-- 149 — Sync selling price when a sale depletes a batch
--
-- sync_selling_price_from_batches() (146) only ran from the manual batch
-- add/edit/delete actions on the edit page — never from consume_and_freeze_cost,
-- which is what every real stock-decreasing sale/repair-part/exchange action
-- routes through. So once a POS sale fully depleted the oldest batch, the
-- displayed selling price stayed stuck at that exhausted batch's price until
-- someone happened to manually touch the batches UI again.
--
-- Fix: call sync_selling_price_from_batches from inside consume_and_freeze_cost
-- itself — the single choke point process_sale, deduct_repair_parts,
-- apply_inventory_adjustment, and process_exchange all already go through.
-- ============================================================

CREATE OR REPLACE FUNCTION consume_and_freeze_cost(
  p_product_id      UUID,
  p_branch_id       UUID,
  p_qty             INT,
  p_current_on_hand INT,
  p_variant_id      UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_valuation  TEXT;
  v_fallback   NUMERIC;
  v_layer_qty  INT;
  v_cost       NUMERIC;
BEGIN
  -- Prefer the variant's own cost_price when one is set; average_cost DEFAULTs
  -- to 0 (not NULL) so NULLIF treats that unset-zero as "no real average yet."
  SELECT COALESCE(p.valuation_method, 'weighted_average'),
         COALESCE(NULLIF(pv.cost_price, 0), NULLIF(p.average_cost, 0), p.cost_price, 0)
    INTO v_valuation, v_fallback
    FROM products p
    LEFT JOIN product_variants pv ON pv.id = p_variant_id
   WHERE p.id = p_product_id;

  IF v_valuation NOT IN ('fifo', 'lifo') THEN
    -- Weighted-average products don't draw down individual batches — the
    -- blended average_cost (kept correct by update_average_cost() on every
    -- receipt) already represents the right cost to freeze. Stays
    -- product-level even for variant products (see plan's stated limitation).
    RETURN v_fallback;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_layer_qty
    FROM inventory_cost_layers
   WHERE product_id = p_product_id AND branch_id = p_branch_id
     AND variant_id IS NOT DISTINCT FROM p_variant_id;

  IF v_layer_qty = 0 AND p_current_on_hand > 0 THEN
    INSERT INTO inventory_cost_layers(product_id, branch_id, variant_id, quantity, unit_cost, received_at, source_type)
    VALUES (p_product_id, p_branch_id, p_variant_id, p_current_on_hand, v_fallback, NOW() - INTERVAL '1 second', 'adjustment');
  END IF;

  v_cost := consume_cost_layers(p_product_id, p_branch_id, p_qty, v_valuation, p_variant_id);
  IF v_cost IS NULL THEN
    v_cost := v_fallback;
  END IF;

  -- Consuming (or seeding) layers changes which batch is now oldest —
  -- keep the flat selling_price column POS reads in sync with it.
  PERFORM sync_selling_price_from_batches(p_product_id, p_variant_id);

  RETURN v_cost;
END;
$$;
