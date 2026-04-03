-- ============================================================
-- 010_pos_refunds.sql
-- Add refund support to sales table + atomic refund processor
-- ============================================================

ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_refund BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS refund_reason TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS original_sale_id UUID REFERENCES sales(id);

-- Atomic refund processor
-- Inserts a negative-total sale, restores inventory, marks original as refunded
CREATE OR REPLACE FUNCTION process_refund(p_refund_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_refund_id    UUID;
  v_item         JSONB;
BEGIN
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
    NULLIF(p_refund_data->>'original_sale_id', '')::UUID,
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

    -- Restore inventory if not a service
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

  -- Update original sale status to refunded
  UPDATE sales
  SET payment_status = 'refunded'
  WHERE id = NULLIF(p_refund_data->>'original_sale_id', '')::UUID;

  RETURN v_refund_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
