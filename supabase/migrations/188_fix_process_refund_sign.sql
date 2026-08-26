-- Migration 188: CRITICAL — process_refund() sign bug made Expected Cash go
-- UP instead of down when a cash refund was processed through the Sales
-- page's inline refund modal.
--
-- process_refund(p_refund_data JSONB) always negated whatever `total` (and
-- `subtotal`/`tax`, and each item's `total`) the caller sent, then stored
-- that as the new refund row's value:
--   total = -((p_refund_data->>'total')::NUMERIC)
--
-- The DB/register-formula convention (confirmed by
-- supabase/tests/register_expected_cash.test.sql Group A) is that a refund
-- row's stored `total` must be a POSITIVE magnitude (e.g. total = 50 for a
-- £50 refund), with is_refund = true as the flag —
-- register_session_expected()/close_register_session() compute
-- v_cash_refunds = SUM(total) WHERE payment_method='cash' AND is_refund=true
-- and then subtract it (v_expected := ... - v_cash_refunds), which only
-- produces a decrease if total is positive.
--
-- Two different refund UIs call this same function with OPPOSITE sign
-- conventions:
--   - src/app/(tenant)/pos/refund/page.tsx sends an already-NEGATIVE total
--     -> negated again -> stored POSITIVE -> correct.
--   - src/app/(tenant)/sales/page.tsx's inline refund modal (refundMutation)
--     sends a POSITIVE total -> negated -> stored NEGATIVE -> v_cash_refunds
--     goes negative -> v_expected := ... - (negative) = ... + amount ->
--     Expected Cash INCREASES by the refund amount instead of decreasing.
--     Live-reproduced: refunding €100 via this modal took Expected Cash from
--     €340 to €440 instead of €240.
--
-- Fix: normalize the sign at this single shared choke point using ABS(),
-- instead of trusting either caller's convention. ABS() produces the
-- correct positive magnitude regardless of what sign any current or future
-- caller sends, fixing the broken caller and leaving the already-correct
-- one unaffected. Applied to subtotal, tax, total, and each sale_items.total
-- for consistency (same bug pattern, lower-risk fields but same fix).

CREATE OR REPLACE FUNCTION process_refund(p_refund_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_refund_id       UUID;
  v_item            JSONB;
  v_original_id     UUID;
  v_orig_qty        INT;
  v_refunded_qty    INT;
  v_all_refunded    BOOLEAN;
  v_item_cost       NUMERIC;
  v_discount_alloc  UUID;
  v_alloc_product   UUID;
  v_alloc_variant   UUID;
  v_alloc_branch    UUID;
  v_can_reactivate  BOOLEAN;
  v_invoice_number  TEXT;
BEGIN
  v_original_id := NULLIF(p_refund_data->>'original_sale_id', '')::UUID;

  IF v_original_id IS NOT NULL THEN
    PERFORM 1 FROM sales WHERE id = v_original_id FOR UPDATE;
  END IF;

  IF v_original_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_refund_data->'items')
    LOOP
      SELECT COALESCE(SUM(si.quantity), 0) INTO v_orig_qty
      FROM sale_items si WHERE si.sale_id = v_original_id AND si.name = v_item->>'name';

      SELECT COALESCE(SUM(si.quantity), 0) INTO v_refunded_qty
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.original_sale_id = v_original_id AND s.is_refund = true AND si.name = v_item->>'name';

      IF (v_item->>'quantity')::INT > (v_orig_qty - v_refunded_qty) THEN
        RAISE EXCEPTION 'Cannot refund more than remaining quantity for: %', v_item->>'name';
      END IF;
    END LOOP;
  END IF;

  v_invoice_number := generate_invoice_number((p_refund_data->>'branch_id')::UUID);

  INSERT INTO sales (
    branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_status,
    is_refund, refund_reason, original_sale_id,
    notes, invoice_number
  )
  VALUES (
    (p_refund_data->>'branch_id')::UUID,
    NULLIF(p_refund_data->>'customer_id', '')::UUID,
    NULLIF(p_refund_data->>'cashier_id', '')::UUID,
    ABS((p_refund_data->>'subtotal')::NUMERIC),
    0,
    ABS((p_refund_data->>'tax')::NUMERIC),
    ABS((p_refund_data->>'total')::NUMERIC),
    COALESCE(p_refund_data->>'payment_method', 'cash'),
    'refunded',
    true,
    p_refund_data->>'refund_reason',
    v_original_id,
    'Refund for sale ' || COALESCE(p_refund_data->>'original_sale_id', ''),
    v_invoice_number
  )
  RETURNING id INTO v_refund_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_refund_data->'items')
  LOOP
    v_item_cost      := NULL;
    v_discount_alloc := NULL;
    IF v_original_id IS NOT NULL THEN
      SELECT si.unit_cost, si.discount_allocation_id INTO v_item_cost, v_discount_alloc
      FROM sale_items si
      WHERE si.sale_id = v_original_id AND si.name = v_item->>'name'
      LIMIT 1;
    END IF;

    INSERT INTO sale_items (
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, unit_cost, discount_allocation_id
    )
    VALUES (
      v_refund_id,
      NULLIF(v_item->>'product_id', '')::UUID,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      0,
      ABS((v_item->>'total')::NUMERIC),
      v_item_cost,
      v_discount_alloc
    );

    IF (v_item->>'is_service')::BOOLEAN IS NOT TRUE THEN
      UPDATE inventory
      SET quantity = quantity + (v_item->>'quantity')::INT, updated_at = NOW()
      WHERE branch_id = (p_refund_data->>'branch_id')::UUID
        AND product_id = NULLIF(v_item->>'product_id', '')::UUID
        AND (
          variant_id = NULLIF(v_item->>'variant_id', '')::UUID
          OR (variant_id IS NULL AND NULLIF(v_item->>'variant_id', '') IS NULL)
        );

      PERFORM restore_cost_layer(
        NULLIF(v_item->>'product_id', '')::UUID,
        (p_refund_data->>'branch_id')::UUID,
        (v_item->>'quantity')::INT,
        v_item_cost,
        NULLIF(v_item->>'variant_id', '')::UUID
      );

      IF v_discount_alloc IS NOT NULL THEN
        SELECT product_id, variant_id, branch_id INTO v_alloc_product, v_alloc_variant, v_alloc_branch
        FROM product_discount_allocations WHERE id = v_discount_alloc FOR UPDATE;

        SELECT NOT EXISTS (
          SELECT 1 FROM product_discount_allocations
          WHERE id <> v_discount_alloc AND status = 'active'
            AND product_id = v_alloc_product AND branch_id = v_alloc_branch
            AND variant_id IS NOT DISTINCT FROM v_alloc_variant
        ) INTO v_can_reactivate;

        UPDATE product_discount_allocations
        SET quantity_remaining = quantity_remaining + (v_item->>'quantity')::INT,
            status   = CASE WHEN v_can_reactivate THEN 'active' ELSE status END,
            ended_at = CASE WHEN v_can_reactivate THEN NULL ELSE ended_at END
        WHERE id = v_discount_alloc;
      END IF;

      INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, reference_id, note)
      VALUES (
        (p_refund_data->>'branch_id')::UUID,
        NULLIF(v_item->>'product_id', '')::UUID,
        NULLIF(v_item->>'variant_id', '')::UUID,
        'return', (v_item->>'quantity')::INT, v_refund_id, 'POS Refund'
      );
    END IF;
  END LOOP;

  IF v_original_id IS NOT NULL THEN
    SELECT bool_and(
      (
        SELECT COALESCE(SUM(ri.quantity), 0)
        FROM sale_items ri
        JOIN sales rs ON rs.id = ri.sale_id
        WHERE rs.original_sale_id = v_original_id AND rs.is_refund = true AND ri.name = osi.name
      ) >= osi.quantity
    ) INTO v_all_refunded
    FROM sale_items osi WHERE osi.sale_id = v_original_id;

    UPDATE sales
    SET payment_status = CASE WHEN v_all_refunded THEN 'refunded' ELSE 'partial' END
    WHERE id = v_original_id;
  END IF;

  RETURN v_refund_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
