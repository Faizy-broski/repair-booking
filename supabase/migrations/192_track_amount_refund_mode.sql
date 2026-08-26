-- Migration 192: "Refund Amount" mode blocked further refunds on the same
-- item entirely, instead of correctly tracking the remaining balance.
--
-- Migration 191 fixed process_refund() rejecting amount-mode refunds
-- outright. The companion client-side fix (removing the fake
-- "<name> (amount refund)" item name) fixed the 500 error's sibling bug
-- (the "already refunded" check never finding the refund at all) but
-- introduced a new problem: getAlreadyRefunded() on the Sales page counts
-- refunded QUANTITY by matching item name, with no way to tell an
-- amount-mode refund's dummy quantity=1 apart from a real 1-unit Return
-- Items refund. Once ANY amount is refunded via Amount mode, the item now
-- reads as "fully refunded" (quantity 1 of 1) and both "Return Items" AND
-- "Refund Amount" mode's per-item cap (which was never reduced by prior
-- refunds at all, a second bug on the Amount side) stopped reflecting the
-- true remaining balance.
--
-- Fix: persist a real is_amount_refund flag on the refund's sale_items row
-- (sourced from the same is_service flag already sent by the client -- Return
-- Items mode always sends is_service=false, Amount mode always sends
-- is_service=true, so it's already a reliable discriminator) so the client
-- can exclude amount-mode dummy quantities from quantity-based "remaining"
-- tracking, and track remaining VALUE (not quantity) for Amount mode
-- correctly instead.

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS is_amount_refund BOOLEAN NOT NULL DEFAULT false;

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
      -- Skip the quantity-remaining check for is_service items (migration
      -- 191) -- "Refund Amount" mode's dummy quantity=1 isn't a real unit
      -- count, and it never restocks inventory (see the is_service guard
      -- below), so there's nothing meaningful to validate here.
      IF COALESCE((v_item->>'is_service')::BOOLEAN, false) IS NOT TRUE THEN
        SELECT COALESCE(SUM(si.quantity), 0) INTO v_orig_qty
        FROM sale_items si WHERE si.sale_id = v_original_id AND si.name = v_item->>'name';

        SELECT COALESCE(SUM(si.quantity), 0) INTO v_refunded_qty
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.original_sale_id = v_original_id AND s.is_refund = true AND si.name = v_item->>'name'
          AND si.is_amount_refund = false;

        IF (v_item->>'quantity')::INT > (v_orig_qty - v_refunded_qty) THEN
          RAISE EXCEPTION 'Cannot refund more than remaining quantity for: %', v_item->>'name';
        END IF;
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
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, unit_cost, discount_allocation_id, is_amount_refund
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
      v_discount_alloc,
      COALESCE((v_item->>'is_service')::BOOLEAN, false)
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
          AND ri.is_amount_refund = false
      ) >= osi.quantity
      OR
      -- Fully refunded also counts if the item's whole VALUE has been
      -- refunded across any mix of modes (e.g. entirely via Amount mode,
      -- which never contributes a matching quantity above).
      (
        SELECT COALESCE(SUM(ri.total), 0)
        FROM sale_items ri
        JOIN sales rs ON rs.id = ri.sale_id
        WHERE rs.original_sale_id = v_original_id AND rs.is_refund = true AND ri.name = osi.name
      ) >= osi.total
    ) INTO v_all_refunded
    FROM sale_items osi WHERE osi.sale_id = v_original_id;

    UPDATE sales
    SET payment_status = CASE WHEN v_all_refunded THEN 'refunded' ELSE 'partial' END
    WHERE id = v_original_id;
  END IF;

  RETURN v_refund_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
