-- ============================================================
-- 009_pos_split_payment.sql
-- Add payment_splits JSONB to sales table
-- Update process_sale function to persist split breakdown
-- ============================================================

ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_splits JSONB DEFAULT '[]'::jsonb;

-- Replace process_sale to support split payments
CREATE OR REPLACE FUNCTION process_sale(p_sale_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_sale_id      UUID;
  v_item         JSONB;
  v_inventory_id UUID;
  v_current_qty  INT;
BEGIN
  -- Insert the sale record
  INSERT INTO sales (
    branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_status,
    payment_splits, gift_card_id, notes
  )
  VALUES (
    (p_sale_data->>'branch_id')::UUID,
    NULLIF(p_sale_data->>'customer_id', '')::UUID,
    NULLIF(p_sale_data->>'cashier_id', '')::UUID,
    (p_sale_data->>'subtotal')::NUMERIC,
    COALESCE((p_sale_data->>'discount')::NUMERIC, 0),
    COALESCE((p_sale_data->>'tax')::NUMERIC, 0),
    (p_sale_data->>'total')::NUMERIC,
    COALESCE(p_sale_data->>'payment_method', 'cash'),
    'paid',
    COALESCE(p_sale_data->'payment_splits', '[]'::jsonb),
    NULLIF(p_sale_data->>'gift_card_id', '')::UUID,
    p_sale_data->>'notes'
  )
  RETURNING id INTO v_sale_id;

  -- Process each line item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_data->'items')
  LOOP
    INSERT INTO sale_items (
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total
    )
    VALUES (
      v_sale_id,
      NULLIF(v_item->>'product_id', '')::UUID,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      COALESCE((v_item->>'discount')::NUMERIC, 0),
      (v_item->>'total')::NUMERIC
    );

    -- Deduct inventory if not a service
    IF (v_item->>'is_service')::BOOLEAN IS NOT TRUE THEN
      SELECT id, quantity INTO v_inventory_id, v_current_qty
      FROM inventory
      WHERE branch_id = (p_sale_data->>'branch_id')::UUID
        AND product_id = NULLIF(v_item->>'product_id', '')::UUID
        AND (
          variant_id = NULLIF(v_item->>'variant_id', '')::UUID
          OR (variant_id IS NULL AND NULLIF(v_item->>'variant_id', '') IS NULL)
        )
      FOR UPDATE;

      IF v_inventory_id IS NOT NULL THEN
        IF v_current_qty < (v_item->>'quantity')::INT THEN
          RAISE EXCEPTION 'Insufficient stock for product: %', v_item->>'name';
        END IF;

        UPDATE inventory
        SET quantity = quantity - (v_item->>'quantity')::INT,
            updated_at = NOW()
        WHERE id = v_inventory_id;

        INSERT INTO stock_movements (
          branch_id, product_id, variant_id, type, quantity, reference_id, note
        )
        VALUES (
          (p_sale_data->>'branch_id')::UUID,
          NULLIF(v_item->>'product_id', '')::UUID,
          NULLIF(v_item->>'variant_id', '')::UUID,
          'sale',
          -((v_item->>'quantity')::INT),
          v_sale_id,
          'POS Sale'
        );
      END IF;
    END IF;
  END LOOP;

  -- Handle gift card balance deduction
  IF p_sale_data->>'gift_card_id' IS NOT NULL AND p_sale_data->>'gift_card_amount' IS NOT NULL THEN
    UPDATE gift_cards
    SET balance = balance - (p_sale_data->>'gift_card_amount')::NUMERIC
    WHERE id = (p_sale_data->>'gift_card_id')::UUID
      AND balance >= (p_sale_data->>'gift_card_amount')::NUMERIC;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient gift card balance';
    END IF;
  END IF;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
