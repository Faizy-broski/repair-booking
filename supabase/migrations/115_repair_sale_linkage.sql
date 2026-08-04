-- Migration 115: Repair Sale Linkage
-- Links a POS sale_items row back to the repairs row it paid for, instead of
-- overloading sale_items.product_id with a repair's UUID (which has no row
-- in `products` and risks a foreign-key violation on checkout). Also fixes
-- the shift Z-Report "Repair Sales" figure to source from real POS-charged
-- amounts (when paid via POS) and from repairs.actual_cost/estimated_cost
-- (when a repair is marked "Collected" directly in the Repairs module),
-- deduped so no repair's revenue is ever counted twice.

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS repair_id UUID REFERENCES repairs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_repair
  ON sale_items(repair_id) WHERE repair_id IS NOT NULL;

-- ── process_sale: accept an explicit repair_id per line item ──────────────────
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
  v_repair_id      UUID;
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
    v_repair_id := NULLIF(v_item->>'repair_id', '')::UUID;

    INSERT INTO sale_items (
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, repair_id
    )
    VALUES (
      v_sale_id,
      -- A repair-job line item never has a row in `products` — never write
      -- its (repair) id into product_id, regardless of what the client sent.
      CASE WHEN v_repair_id IS NOT NULL THEN NULL ELSE NULLIF(v_item->>'product_id', '')::UUID END,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      COALESCE((v_item->>'discount')::NUMERIC, 0),
      (v_item->>'total')::NUMERIC,
      v_repair_id
    );

    IF (v_item->>'is_service')::BOOLEAN IS NOT TRUE AND v_repair_id IS NULL THEN
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

  IF NULLIF(p_sale_data->>'customer_id', '') IS NOT NULL AND p_sale_data->>'store_credit_amount' IS NOT NULL
     AND (p_sale_data->>'store_credit_amount')::NUMERIC > 0 THEN
    PERFORM apply_store_credit(
      (SELECT b.business_id FROM branches b WHERE b.id = (p_sale_data->>'branch_id')::UUID),
      NULLIF(p_sale_data->>'customer_id', '')::UUID,
      (p_sale_data->>'store_credit_amount')::NUMERIC,
      'POS sale payment',
      v_sale_id,
      'sale'
    );
  END IF;

  IF NULLIF(p_sale_data->>'customer_id', '') IS NOT NULL AND p_sale_data->>'loyalty_points_used' IS NOT NULL
     AND (p_sale_data->>'loyalty_points_used')::INT > 0 THEN
    PERFORM apply_loyalty_redeem(
      (SELECT b.business_id FROM branches b WHERE b.id = (p_sale_data->>'branch_id')::UUID),
      NULLIF(p_sale_data->>'customer_id', '')::UUID,
      (p_sale_data->>'loyalty_points_used')::INT,
      v_sale_id,
      'sale'
    );
  END IF;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── close_register_session: repair sales = POS-paid this shift + repairs ──────
-- marked "Collected" directly in the Repairs module during this shift's
-- window (deduped so a repair counted in one channel is never counted again
-- in the other).
CREATE OR REPLACE FUNCTION close_register_session(
  p_session_id   UUID,
  p_closing_cash NUMERIC,
  p_closing_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_session          register_sessions%ROWTYPE;
  v_total_sales      NUMERIC := 0;
  v_total_refunds    NUMERIC := 0;
  v_cash_sales       NUMERIC := 0;
  v_card_sales       NUMERIC := 0;
  v_other_sales      NUMERIC := 0;
  v_tx_count         INT     := 0;
  v_cash_in          NUMERIC := 0;
  v_cash_out         NUMERIC := 0;
  v_expected         NUMERIC := 0;
  v_variance         NUMERIC := 0;
  v_repair_sales     NUMERIC := 0;
  v_repair_refunds   NUMERIC := 0;
  v_repair_tx_count  INT     := 0;
BEGIN
  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  IF v_session.status = 'closed' THEN
    RAISE EXCEPTION 'Session already closed';
  END IF;

  -- Aggregate sales since session opened
  SELECT
    COALESCE(SUM(CASE WHEN is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN is_refund = true  THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'cash'  AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'card'  AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method NOT IN ('cash','card') AND is_refund = false THEN total ELSE 0 END), 0),
    COUNT(*)
  INTO
    v_total_sales, v_total_refunds,
    v_cash_sales, v_card_sales, v_other_sales,
    v_tx_count
  FROM sales
  WHERE branch_id = v_session.branch_id
    AND created_at >= v_session.opened_at
    AND created_at <= NOW();

  -- Aggregate cash movements for this session (global, not tied to sale type)
  SELECT
    COALESCE(SUM(CASE WHEN type = 'cash_in'  THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount ELSE 0 END), 0)
  INTO v_cash_in, v_cash_out
  FROM cash_movements
  WHERE session_id = p_session_id;

  -- Repair sales: POS-paid this shift, plus repairs marked "Collected"
  -- directly in the Repairs module during this shift's window (deduped).
  WITH pos_paid AS (
    SELECT si.repair_id,
           SUM(CASE WHEN s.is_refund = false THEN si.total ELSE 0 END) AS amt,
           SUM(CASE WHEN s.is_refund = true  THEN si.total ELSE 0 END) AS refund_amt
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.branch_id = v_session.branch_id
      AND si.repair_id IS NOT NULL
      AND s.created_at >= v_session.opened_at
      AND s.created_at <= NOW()
    GROUP BY si.repair_id
  ),
  collected_elsewhere AS (
    SELECT DISTINCT ON (rsh.repair_id) rsh.repair_id,
           COALESCE(r.actual_cost, r.estimated_cost, 0) AS amt
    FROM repair_status_history rsh
    JOIN repairs r ON r.id = rsh.repair_id
    WHERE r.branch_id = v_session.branch_id
      AND rsh.new_status ILIKE 'collected'
      AND rsh.created_at >= v_session.opened_at
      AND rsh.created_at <= NOW()
      AND rsh.repair_id NOT IN (SELECT repair_id FROM pos_paid)
    ORDER BY rsh.repair_id, rsh.created_at ASC
  ),
  refunded_elsewhere AS (
    SELECT DISTINCT ON (rsh.repair_id) rsh.repair_id, r.refund_amount AS amt
    FROM repair_status_history rsh
    JOIN repairs r ON r.id = rsh.repair_id
    WHERE r.branch_id = v_session.branch_id
      AND rsh.new_status ILIKE 'refunded'
      AND rsh.created_at >= v_session.opened_at
      AND rsh.created_at <= NOW()
      AND rsh.repair_id NOT IN (SELECT repair_id FROM pos_paid)
    ORDER BY rsh.repair_id, rsh.created_at ASC
  )
  SELECT
    COALESCE((SELECT SUM(amt)        FROM pos_paid), 0) + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0),
    COALESCE((SELECT SUM(refund_amt) FROM pos_paid), 0) + COALESCE((SELECT SUM(amt) FROM refunded_elsewhere), 0),
    (SELECT COUNT(*) FROM pos_paid) + (SELECT COUNT(*) FROM collected_elsewhere)
  INTO v_repair_sales, v_repair_refunds, v_repair_tx_count;

  -- Cash-drawer reconciliation stays product-cash-only: repairs have no
  -- payment_method on the drawer side, so we cannot know whether repair
  -- revenue entered the drawer as cash. A cash repair payment should be
  -- logged as a manual Cash In movement, which already flows into v_cash_in.
  v_expected := v_session.opening_float + v_cash_sales + v_cash_in - v_cash_out - v_total_refunds;
  v_variance := p_closing_cash - v_expected;

  UPDATE register_sessions SET
    closing_cash             = p_closing_cash,
    closing_note              = p_closing_note,
    expected_cash              = v_expected,
    variance                   = v_variance,
    total_sales                = v_total_sales,
    total_refunds               = v_total_refunds,
    cash_sales                  = v_cash_sales,
    card_sales                  = v_card_sales,
    other_sales                 = v_other_sales,
    transaction_count            = v_tx_count,
    cash_in_total                 = v_cash_in,
    cash_out_total                 = v_cash_out,
    repair_sales                    = v_repair_sales,
    repair_refunds                   = v_repair_refunds,
    repair_transaction_count          = v_repair_tx_count,
    closed_at                          = NOW(),
    status                              = 'closed'
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id',               p_session_id,
    'total_sales',               v_total_sales,
    'total_refunds',             v_total_refunds,
    'cash_sales',                v_cash_sales,
    'card_sales',                v_card_sales,
    'other_sales',               v_other_sales,
    'transaction_count',         v_tx_count,
    'cash_in',                   v_cash_in,
    'cash_out',                  v_cash_out,
    'opening_float',             v_session.opening_float,
    'closing_cash',              p_closing_cash,
    'expected_cash',             v_expected,
    'variance',                  v_variance,
    'repair_sales',              v_repair_sales,
    'repair_refunds',            v_repair_refunds,
    'repair_transaction_count',  v_repair_tx_count,
    'grand_total',               v_total_sales + v_repair_sales - v_repair_refunds,
    'opened_at',                 v_session.opened_at,
    'closed_at',                 NOW()
  );
END;
$$;
