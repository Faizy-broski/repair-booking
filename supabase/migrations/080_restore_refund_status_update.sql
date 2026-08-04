-- ============================================================
-- 080 — Restore: process_refund marks original sale as 'refunded'
-- This is the guard that prevents the same sale being refunded twice.
-- Reverts the change made in 079.
-- ============================================================

CREATE OR REPLACE FUNCTION process_refund(p_refund_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_refund_id    UUID;
  v_item         JSONB;
  v_original_id  UUID;
BEGIN
  v_original_id := NULLIF(p_refund_data->>'original_sale_id', '')::UUID;

  -- Prevent double-refund: reject if original is already refunded
  IF v_original_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM sales
      WHERE id = v_original_id AND payment_status = 'refunded'
    ) THEN
      RAISE EXCEPTION 'Sale has already been refunded';
    END IF;
  END IF;

  -- Insert the refund sale record (negative total)
  INSERT INTO sales (
    branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_status,
    is_refund, refund_reason, original_sale_id,
    notes
  )
  VALUES (
    (p_refund_data->>'branch_id')::UUID,
    NULLIF(p_refund_data->>'customer_id', '')::UUID,
    NULLIF(p_refund_data->>'cashier_id', '')::UUID,
    -((p_refund_data->>'subtotal')::NUMERIC),
    0,
    -((p_refund_data->>'tax')::NUMERIC),
    -((p_refund_data->>'total')::NUMERIC),
    COALESCE(p_refund_data->>'payment_method', 'cash'),
    'refunded',
    true,
    p_refund_data->>'refund_reason',
    v_original_id,
    'Refund for sale ' || COALESCE(p_refund_data->>'original_sale_id', '')
  )
  RETURNING id INTO v_refund_id;

  -- Process each refund line item and restore inventory
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_refund_data->'items')
  LOOP
    INSERT INTO sale_items (
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total
    )
    VALUES (
      v_refund_id,
      NULLIF(v_item->>'product_id', '')::UUID,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      0,
      -((v_item->>'total')::NUMERIC)
    );

    IF (v_item->>'is_service')::BOOLEAN IS NOT TRUE THEN
      UPDATE inventory
      SET quantity = quantity + (v_item->>'quantity')::INT,
          updated_at = NOW()
      WHERE branch_id = (p_refund_data->>'branch_id')::UUID
        AND product_id = NULLIF(v_item->>'product_id', '')::UUID
        AND (
          variant_id = NULLIF(v_item->>'variant_id', '')::UUID
          OR (variant_id IS NULL AND NULLIF(v_item->>'variant_id', '') IS NULL)
        );

      INSERT INTO stock_movements (
        branch_id, product_id, variant_id, type, quantity, reference_id, note
      )
      VALUES (
        (p_refund_data->>'branch_id')::UUID,
        NULLIF(v_item->>'product_id', '')::UUID,
        NULLIF(v_item->>'variant_id', '')::UUID,
        'return',
        (v_item->>'quantity')::INT,
        v_refund_id,
        'POS Refund'
      );
    END IF;
  END LOOP;

  -- Mark the original sale as refunded (also acts as double-refund guard)
  IF v_original_id IS NOT NULL THEN
    UPDATE sales SET payment_status = 'refunded' WHERE id = v_original_id;
  END IF;

  RETURN v_refund_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
