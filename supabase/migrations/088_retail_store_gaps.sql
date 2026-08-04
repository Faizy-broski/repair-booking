-- ============================================================================
-- 088 — Retail Store: base salary, served-by employee on sales, payroll update
-- ============================================================================
-- All changes are additive / backward-compatible:
--   • New nullable / DEFAULT 0 columns — existing rows unaffected
--   • process_sale: missing served_by key in JSON → NULLIF → NULL (safe)
--   • gross_pay rebuild: base_salary DEFAULT 0 → identical math for old rows
--   • Template UPDATE only affects NEW retail-store signups, not existing tenants
-- ============================================================================

-- ── 1. employees.base_salary ─────────────────────────────────────────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS base_salary NUMERIC(10,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN employees.base_salary IS
  'Optional fixed salary per pay period. Gross pay = base_salary + (hours × hourly_rate) + commissions';

-- ── 2. sales.served_by_employee_id ───────────────────────────────────────────

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS served_by_employee_id UUID
    REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_served_by
  ON sales(served_by_employee_id)
  WHERE served_by_employee_id IS NOT NULL;

COMMENT ON COLUMN sales.served_by_employee_id IS
  'Employee who served the customer. Commission routes here; falls back to cashier_id when NULL';

-- ── 3. payroll_periods — add base_salary snapshot, rebuild gross_pay ─────────
-- gross_pay was: total_hours * hourly_rate + commission_total (GENERATED STORED)
-- gross_pay now: base_salary + total_hours * hourly_rate + commission_total
--
-- Safety check before running: confirm no views reference gross_pay
-- (Run this query manually first; if result is empty, proceed):
--   SELECT dependent_ns.nspname, dependent_view.relname
--   FROM pg_depend
--   JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
--   JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid
--   JOIN pg_class AS source_table ON pg_depend.refobjid = source_table.oid
--   JOIN pg_namespace AS dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
--   JOIN pg_attribute ON pg_depend.refobjid = pg_attribute.attrelid
--     AND pg_depend.refobjsubid = pg_attribute.attnum
--   WHERE source_table.relname = 'payroll_periods' AND pg_attribute.attname = 'gross_pay';

ALTER TABLE payroll_periods DROP COLUMN IF EXISTS gross_pay;

ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS base_salary NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN gross_pay NUMERIC(10,2) GENERATED ALWAYS AS
    (base_salary + total_hours * hourly_rate + commission_total) STORED;

COMMENT ON COLUMN payroll_periods.base_salary IS
  'Snapshot of employee base_salary at time of payroll creation';

-- ── 4. Update process_sale to write served_by_employee_id ────────────────────
-- Full replacement of migration 036 version. Only addition: served_by_employee_id
-- in the INSERT. If the JSON key is absent (old clients), NULLIF returns NULL.

CREATE OR REPLACE FUNCTION process_sale(p_sale_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_sale_id      UUID;
  v_item         JSONB;
  v_inventory_id UUID;
  v_current_qty  INT;
  v_product_id   UUID;
  v_is_service   BOOLEAN;
BEGIN
  -- Insert the sale record
  INSERT INTO sales (
    branch_id, customer_id, cashier_id, served_by_employee_id,
    subtotal, discount, tax, total,
    payment_method, payment_status,
    payment_splits, gift_card_id, notes
  )
  VALUES (
    (p_sale_data->>'branch_id')::UUID,
    NULLIF(p_sale_data->>'customer_id', '')::UUID,
    NULLIF(p_sale_data->>'cashier_id', '')::UUID,
    NULLIF(p_sale_data->>'served_by_employee_id', '')::UUID,
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
    v_is_service := COALESCE((v_item->>'is_service')::BOOLEAN, FALSE);

    -- Service items (repairs, misc) are NOT in the products table — force NULL
    -- to avoid FK constraint violation regardless of what the frontend sends.
    IF v_is_service THEN
      v_product_id := NULL;
    ELSE
      v_product_id := NULLIF(v_item->>'product_id', '')::UUID;
    END IF;

    INSERT INTO sale_items (
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total
    )
    VALUES (
      v_sale_id,
      v_product_id,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      COALESCE((v_item->>'discount')::NUMERIC, 0),
      (v_item->>'total')::NUMERIC
    );

    -- Deduct inventory only for real products
    IF NOT v_is_service AND v_product_id IS NOT NULL THEN
      SELECT id, quantity INTO v_inventory_id, v_current_qty
      FROM inventory
      WHERE branch_id = (p_sale_data->>'branch_id')::UUID
        AND product_id = v_product_id
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
          v_product_id,
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

-- ── 5. Update calculate_payroll to include base_salary ────────────────────────
-- Postgres cannot CREATE OR REPLACE a function when the RETURNS TABLE(...)
-- column list changes (adding base_salary) — must DROP the old signature first.

DROP FUNCTION IF EXISTS calculate_payroll(UUID, UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION calculate_payroll(
  p_employee_id UUID,
  p_branch_id   UUID,
  p_start_date  DATE,
  p_end_date    DATE
)
RETURNS TABLE (
  total_hours      NUMERIC,
  hourly_pay       NUMERIC,
  commission_total NUMERIC,
  base_salary      NUMERIC,
  gross_pay        NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hourly_rate NUMERIC;
  v_base_salary NUMERIC;
  v_hours       NUMERIC;
  v_commission  NUMERIC;
BEGIN
  SELECT COALESCE(hourly_rate, 0), COALESCE(base_salary, 0)
    INTO v_hourly_rate, v_base_salary
    FROM employees WHERE id = p_employee_id;

  SELECT COALESCE(
    SUM(
      EXTRACT(EPOCH FROM (
        COALESCE(clock_out, NOW()) - clock_in
      )) / 3600.0
      - COALESCE(break_minutes, 0) / 60.0
    ), 0
  ) INTO v_hours
  FROM time_clocks
  WHERE employee_id = p_employee_id
    AND branch_id   = p_branch_id
    AND clock_in   >= p_start_date
    AND clock_in   <  p_end_date + INTERVAL '1 day';

  SELECT COALESCE(SUM(amount), 0) INTO v_commission
    FROM employee_commissions
   WHERE employee_id = p_employee_id
     AND status IN ('pending','approved')
     AND created_at >= p_start_date
     AND created_at <  p_end_date + INTERVAL '1 day';

  RETURN QUERY SELECT
    ROUND(v_hours, 2)::NUMERIC,
    ROUND(v_hours * v_hourly_rate, 2)::NUMERIC,
    ROUND(v_commission, 2)::NUMERIC,
    ROUND(v_base_salary, 2)::NUMERIC,
    ROUND(v_base_salary + v_hours * v_hourly_rate + v_commission, 2)::NUMERIC;
END;
$$;

-- ── 6. Expand retail-store vertical template module list ──────────────────────
-- Only changes the template definition; existing tenants' business_module_access
-- rows are NOT affected — this only applies to new retail-store signups.

UPDATE business_vertical_templates
SET
  modules_enabled = ARRAY[
    'pos', 'inventory', 'customers', 'invoices', 'employees',
    'expenses', 'reports', 'gift_cards',
    'notifications', 'appointments', 'messages'
  ]::text[],
  module_settings = module_settings || '{
    "appointments": {
      "slot_duration_minutes": 60,
      "buffer_minutes": 15,
      "allow_online_booking": false,
      "booking_advance_days": 30
    },
    "notifications": {
      "email_enabled": true,
      "sms_enabled": false
    }
  }'::jsonb,
  updated_at = NOW()
WHERE slug = 'retail-store';
