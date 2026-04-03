-- ============================================================
-- 003_functions.sql
-- Database functions: atomic POS sale, job number generation,
-- auto-profile creation trigger, updated_at triggers
-- ============================================================

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_businesses
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_branches
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_repairs
  BEFORE UPDATE ON repairs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_customers
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_inventory
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- AUTO-CREATE PROFILE ON AUTH SIGNUP
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- JOB NUMBER GENERATOR
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS repair_job_seq START 1;

CREATE OR REPLACE FUNCTION generate_job_number(p_branch_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_branch_prefix TEXT;
  v_seq           BIGINT;
BEGIN
  SELECT UPPER(LEFT(name, 3)) INTO v_branch_prefix
  FROM branches WHERE id = p_branch_id;

  v_seq := NEXTVAL('repair_job_seq');
  RETURN v_branch_prefix || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- INVOICE NUMBER GENERATOR
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS invoice_seq START 1;

CREATE OR REPLACE FUNCTION generate_invoice_number(p_branch_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  v_seq := NEXTVAL('invoice_seq');
  RETURN 'INV-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ATOMIC POS SALE PROCESSOR
-- Inserts sale + sale_items + decrements inventory in one transaction
-- ============================================================

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
    payment_method, payment_status, gift_card_id, notes
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
    NULLIF(p_sale_data->>'gift_card_id', '')::UUID,
    p_sale_data->>'notes'
  )
  RETURNING id INTO v_sale_id;

  -- Process each line item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_sale_data->'items')
  LOOP
    -- Insert sale_item
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

    -- Deduct inventory if product is not a service and has inventory record
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

        -- Log stock movement
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

-- ============================================================
-- REPAIR STATUS CHANGE WITH HISTORY LOGGING
-- ============================================================

CREATE OR REPLACE FUNCTION update_repair_status(
  p_repair_id UUID,
  p_new_status TEXT,
  p_note TEXT,
  p_changed_by UUID
)
RETURNS VOID AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  SELECT status INTO v_old_status FROM repairs WHERE id = p_repair_id;

  UPDATE repairs
  SET status = p_new_status, updated_at = NOW()
  WHERE id = p_repair_id;

  INSERT INTO repair_status_history (repair_id, old_status, new_status, note, changed_by)
  VALUES (p_repair_id, v_old_status, p_new_status, p_note, p_changed_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DASHBOARD STATS FUNCTION (branch-aware)
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_branch_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
  p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
  v_stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_sales',      COALESCE(SUM(s.total), 0),
    'sales_count',      COUNT(DISTINCT s.id),
    'repairs_open',     (SELECT COUNT(*) FROM repairs r WHERE r.branch_id = p_branch_id AND r.status IN ('received','in_progress','waiting_parts')),
    'repairs_completed',(SELECT COUNT(*) FROM repairs r WHERE r.branch_id = p_branch_id AND r.status = 'repaired' AND r.updated_at::DATE BETWEEN p_start_date AND p_end_date),
    'total_expenses',   COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.branch_id = p_branch_id AND e.expense_date BETWEEN p_start_date AND p_end_date), 0),
    'low_stock_count',  (SELECT COUNT(*) FROM inventory i WHERE i.branch_id = p_branch_id AND i.quantity <= i.low_stock_alert)
  ) INTO v_stats
  FROM sales s
  WHERE s.branch_id = p_branch_id
    AND s.created_at::DATE BETWEEN p_start_date AND p_end_date;

  RETURN v_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
