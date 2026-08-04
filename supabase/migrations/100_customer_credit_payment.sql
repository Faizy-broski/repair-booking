-- ============================================================
-- 100_customer_credit_payment.sql
-- Add on_account (credit) payment method to POS
-- Tracks amount_paid per sale and allows recording later payments
-- ============================================================

-- 1. Extend payment_method to allow on_account
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash','card','voucher','gift_card','split','on_account'));

-- 2. Extend payment_status to allow on_account (fully unpaid credit)
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_status_check
  CHECK (payment_status IN ('paid','refunded','partial','on_account'));

-- 3. Track amount received so far (0 = no payment yet)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 4. Replace process_sale to support on_account payment with dynamic status
CREATE OR REPLACE FUNCTION process_sale(p_sale_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_sale_id        UUID;
  v_item           JSONB;
  v_inventory_id   UUID;
  v_current_qty    INT;
  v_payment_method TEXT;
  v_amount_paid    NUMERIC;
  v_total          NUMERIC;
  v_payment_status TEXT;
BEGIN
  v_payment_method := COALESCE(p_sale_data->>'payment_method', 'cash');
  v_total          := (p_sale_data->>'total')::NUMERIC;
  v_amount_paid    := COALESCE((p_sale_data->>'amount_paid')::NUMERIC, 0);

  -- Derive payment_status for on_account sales; all other methods are fully paid
  IF v_payment_method = 'on_account' THEN
    IF v_amount_paid <= 0 THEN
      v_payment_status := 'on_account';
    ELSIF v_amount_paid >= v_total THEN
      v_payment_status := 'paid';
    ELSE
      v_payment_status := 'partial';
    END IF;
  ELSE
    v_payment_status := 'paid';
  END IF;

  -- Insert the sale record
  INSERT INTO sales (
    branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_status, amount_paid,
    payment_splits, gift_card_id, notes
  )
  VALUES (
    (p_sale_data->>'branch_id')::UUID,
    NULLIF(p_sale_data->>'customer_id', '')::UUID,
    NULLIF(p_sale_data->>'cashier_id', '')::UUID,
    (p_sale_data->>'subtotal')::NUMERIC,
    COALESCE((p_sale_data->>'discount')::NUMERIC, 0),
    COALESCE((p_sale_data->>'tax')::NUMERIC, 0),
    v_total,
    v_payment_method,
    v_payment_status,
    v_amount_paid,
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

-- 5. Function to record a payment against an existing on_account sale
CREATE OR REPLACE FUNCTION record_credit_payment(
  p_sale_id UUID,
  p_amount   NUMERIC,
  p_method   TEXT
)
RETURNS VOID AS $$
DECLARE
  v_total      NUMERIC;
  v_paid       NUMERIC;
  v_new_paid   NUMERIC;
  v_new_status TEXT;
BEGIN
  -- Lock the row to prevent concurrent payment races
  SELECT total, amount_paid
  INTO v_total, v_paid
  FROM sales
  WHERE id = p_sale_id
    AND payment_method = 'on_account'
    AND payment_status != 'paid'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found or already fully paid';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  v_new_paid := v_paid + p_amount;

  IF v_new_paid > v_total + 0.01 THEN
    RAISE EXCEPTION 'Payment of % exceeds outstanding balance of %', p_amount, (v_total - v_paid);
  END IF;

  -- Clamp to avoid floating-point overshoot
  v_new_paid := LEAST(v_new_paid, v_total);

  -- Derive new status
  IF v_new_paid >= v_total THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partial';
  END IF;

  UPDATE sales
  SET amount_paid    = v_new_paid,
      payment_status = v_new_status,
      -- Append the payment to the splits array
      payment_splits = payment_splits || jsonb_build_object('method', p_method, 'amount', p_amount)
  WHERE id = p_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
