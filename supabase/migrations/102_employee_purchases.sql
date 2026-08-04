-- ── Employee Purchases on Credit ─────────────────────────────────────────────
-- Employees can buy from the store on credit.
-- The amount appears in their profile and can be deducted from payroll.

-- 1. Link sales to employees (optional — only set for employee credit purchases)
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_employee_id
  ON sales (employee_id) WHERE employee_id IS NOT NULL;

-- 2. Track purchase deductions on payroll periods
ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS purchase_deductions NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 3. Patch process_sale to store employee_id when present in payload
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

  INSERT INTO sales (
    branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_status, amount_paid,
    payment_splits, gift_card_id, notes, employee_id
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
    p_sale_data->>'notes',
    NULLIF(p_sale_data->>'employee_id', '')::UUID
  )
  RETURNING id INTO v_sale_id;

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
        SET quantity = quantity - (v_item->>'quantity')::INT, updated_at = NOW()
        WHERE id = v_inventory_id;
        INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, reference_id, note)
        VALUES (
          (p_sale_data->>'branch_id')::UUID,
          NULLIF(v_item->>'product_id', '')::UUID,
          NULLIF(v_item->>'variant_id', '')::UUID,
          'sale', -((v_item->>'quantity')::INT), v_sale_id, 'POS Sale'
        );
      END IF;
    END IF;
  END LOOP;

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

-- 4. Helper: get outstanding employee purchase balance for a branch
CREATE OR REPLACE FUNCTION get_employee_purchase_balance(
  p_employee_id UUID,
  p_branch_id   UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(total - COALESCE(amount_paid, 0)), 0)
  FROM sales
  WHERE employee_id = p_employee_id
    AND is_refund   = false
    AND is_exchange = false
    AND payment_status IN ('on_account', 'partial')
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);
$$;
