-- Migration 133: Production-readiness fixes from the register-stats audit.
--
-- 1) Atomic cash movement recording. Previously, a Buyback or Expense cash-out
--    was two independent client-driven API calls: POST /pos/session/movements
--    (insert cash_movements) followed by POST /inventory/buyback or
--    POST /expenses. If the second call failed (e.g. the duplicate-barcode
--    collision seen in production), the cash-out was still recorded with no
--    offsetting product/expense entry — cash removed from the drawer with
--    nothing to show for it. record_cash_movement() does all of this in a
--    single Postgres transaction: if any step raises, the whole thing
--    (including the cash_movements row) rolls back atomically.
--
-- 2) Surface the credit-repayment bridge. register_session_expected() and
--    close_register_session() have always computed same-day cash repayments
--    collected against a PRIOR session's on-account sale (see migration 130)
--    to fold into Expected Cash — but never returned that figure on its own,
--    making it invisible outside of reading the SQL. Both RPCs now return
--    credit_repayments_cash / credit_repayments_total explicitly. Also add
--    buyback_out to close_register_session's return, for parity with
--    register_session_expected (migration 132).

-- ── 1. Atomic cash movement (+ optional expense / buyback side effects) ────────

CREATE OR REPLACE FUNCTION record_cash_movement(
  p_session_id             UUID,
  p_branch_id               UUID,
  p_business_id             UUID,
  p_cashier_id              UUID,
  p_type                    TEXT,
  p_amount                  NUMERIC,
  p_payment_type            TEXT DEFAULT 'cash',
  p_notes                   TEXT DEFAULT NULL,
  p_purpose                 TEXT DEFAULT 'plain',
  p_expense_category_id     UUID DEFAULT NULL,
  p_expense_title           TEXT DEFAULT NULL,
  p_buyback_product_id      UUID DEFAULT NULL,
  p_buyback_name            TEXT DEFAULT NULL,
  p_buyback_selling_price   NUMERIC DEFAULT NULL,
  p_buyback_barcode         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_movement_id UUID;
  v_product_id  UUID;
  v_barcode     TEXT;
  v_inv_id      UUID;
  v_inv_qty     INT;
BEGIN
  INSERT INTO cash_movements (session_id, branch_id, business_id, cashier_id, type, amount, payment_type, notes, purpose)
  VALUES (p_session_id, p_branch_id, p_business_id, p_cashier_id, p_type, p_amount, p_payment_type, p_notes, p_purpose)
  RETURNING id INTO v_movement_id;

  IF p_type = 'cash_out' AND p_purpose = 'expense' THEN
    INSERT INTO expenses (branch_id, category_id, title, amount, expense_date, notes)
    VALUES (p_branch_id, p_expense_category_id, COALESCE(NULLIF(p_expense_title, ''), 'POS Cash Out'), p_amount, CURRENT_DATE, p_notes);
  END IF;

  IF p_type = 'cash_out' AND p_purpose = 'buyback' THEN
    v_product_id := p_buyback_product_id;

    IF v_product_id IS NULL THEN
      v_barcode := NULLIF(p_buyback_barcode, '');
      IF v_barcode IS NULL THEN
        v_barcode := floor(100000000000 + random() * 900000000000)::bigint::text;
      END IF;

      INSERT INTO products (business_id, name, selling_price, cost_price, barcode, item_type, is_trade_in)
      VALUES (p_business_id, p_buyback_name, p_buyback_selling_price, p_amount, v_barcode, 'product', true)
      RETURNING id INTO v_product_id;

      INSERT INTO branch_products (branch_id, product_id, is_enabled)
      VALUES (p_branch_id, v_product_id, true)
      ON CONFLICT (branch_id, product_id) DO UPDATE SET is_enabled = true;
    END IF;

    SELECT id, quantity INTO v_inv_id, v_inv_qty
    FROM inventory
    WHERE branch_id = p_branch_id AND product_id = v_product_id AND variant_id IS NULL;

    IF v_inv_id IS NOT NULL THEN
      UPDATE inventory SET quantity = v_inv_qty + 1, updated_at = NOW() WHERE id = v_inv_id;
    ELSE
      INSERT INTO inventory (branch_id, product_id, quantity, low_stock_alert)
      VALUES (p_branch_id, v_product_id, 1, 5);
    END IF;

    INSERT INTO stock_movements (branch_id, product_id, type, quantity, note)
    VALUES (p_branch_id, v_product_id, 'trade_in', 1, 'Buyback from customer');
  END IF;

  RETURN jsonb_build_object('id', v_movement_id, 'product_id', v_product_id);
END;
$$;

-- ── 2. Surface the credit-repayment bridge on both stats RPCs ──────────────────

CREATE OR REPLACE FUNCTION register_session_expected(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_session                    register_sessions%ROWTYPE;
  v_total_sales                NUMERIC := 0;
  v_total_refunds              NUMERIC := 0;
  v_cash_refunds                NUMERIC := 0;
  v_cash_sales                 NUMERIC := 0;
  v_card_sales                 NUMERIC := 0;
  v_store_credit_sales         NUMERIC := 0;
  v_loyalty_points_sales       NUMERIC := 0;
  v_on_account_sales           NUMERIC := 0;
  v_other_sales                NUMERIC := 0;
  v_tx_count                   INT     := 0;
  v_cash_in                    NUMERIC := 0;
  v_cash_out                   NUMERIC := 0;
  v_buyback_out                NUMERIC := 0;
  v_expected                   NUMERIC := 0;
  v_repair_sales                NUMERIC := 0;
  v_repair_refunds              NUMERIC := 0;
  v_repair_tx_count             INT     := 0;
  v_repair_cash_sales           NUMERIC := 0;
  v_repair_cash_deposits        NUMERIC := 0;
  v_repair_card_sales           NUMERIC := 0;
  v_repair_store_credit_sales   NUMERIC := 0;
  v_repair_loyalty_points_sales NUMERIC := 0;
  v_repair_other_sales          NUMERIC := 0;
  v_credit_repayments_cash      NUMERIC := 0;
  v_credit_repayments_total     NUMERIC := 0;
BEGIN
  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN is_refund = true  THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'cash'           AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'card'           AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'store_credit'   AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'loyalty_points' AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'on_account'     AND is_refund = false THEN amount_paid ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method NOT IN ('cash','card','store_credit','loyalty_points','on_account') AND is_refund = false THEN total ELSE 0 END), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN payment_method = 'cash' AND is_refund = true THEN total ELSE 0 END), 0)
  INTO
    v_total_sales, v_total_refunds,
    v_cash_sales, v_card_sales, v_store_credit_sales, v_loyalty_points_sales, v_on_account_sales, v_other_sales,
    v_tx_count, v_cash_refunds
  FROM sales
  WHERE branch_id = v_session.branch_id
    AND created_at >= v_session.opened_at
    AND created_at <= NOW();

  SELECT
    COALESCE(SUM(CASE WHEN type = 'cash_in'  THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_out' AND purpose = 'buyback' THEN amount ELSE 0 END), 0)
  INTO v_cash_in, v_cash_out, v_buyback_out
  FROM cash_movements
  WHERE session_id = p_session_id;

  SELECT
    COALESCE(SUM(CASE WHEN sp.method = 'cash' THEN sp.amount ELSE 0 END), 0),
    COALESCE(SUM(sp.amount), 0)
  INTO v_credit_repayments_cash, v_credit_repayments_total
  FROM sale_payments sp
  JOIN sales s ON s.id = sp.sale_id
  WHERE s.branch_id = v_session.branch_id
    AND sp.created_at >= v_session.opened_at
    AND sp.created_at <= NOW()
    AND s.created_at < v_session.opened_at;

  v_on_account_sales := v_on_account_sales + v_credit_repayments_total;

  WITH pos_paid AS (
    SELECT si.repair_id,
           SUM(CASE WHEN s.is_refund = false THEN si.total ELSE 0 END) AS amt,
           SUM(CASE WHEN s.is_refund = true  THEN si.total ELSE 0 END) AS refund_amt,
           MAX(s.payment_method) AS payment_method
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.branch_id = v_session.branch_id
      AND si.repair_id IS NOT NULL
      AND s.created_at >= v_session.opened_at
      AND s.created_at <= NOW()
    GROUP BY si.repair_id
  ),
  deposits_at_creation AS (
    SELECT r.id AS repair_id, r.deposit_paid AS amt,
           COALESCE(r.custom_fields->>'payment_method', '') AS payment_method
    FROM repairs r
    WHERE r.branch_id = v_session.branch_id
      AND r.created_at >= v_session.opened_at
      AND r.created_at <= NOW()
      AND COALESCE(r.deposit_paid, 0) > 0
  ),
  collected_elsewhere AS (
    SELECT DISTINCT ON (rsh.repair_id) rsh.repair_id,
           GREATEST(COALESCE(r.actual_cost, r.estimated_cost, 0) - COALESCE(r.deposit_paid, 0), 0) AS amt
    FROM repair_status_history rsh
    JOIN repairs r ON r.id = rsh.repair_id
    WHERE r.branch_id = v_session.branch_id
      AND is_repair_status_collected(rsh.new_status)
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
      AND is_repair_status_refunded(rsh.new_status)
      AND rsh.created_at >= v_session.opened_at
      AND rsh.created_at <= NOW()
      AND rsh.repair_id NOT IN (SELECT repair_id FROM pos_paid)
    ORDER BY rsh.repair_id, rsh.created_at ASC
  )
  SELECT
    COALESCE((SELECT SUM(amt)        FROM pos_paid), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0),
    COALESCE((SELECT SUM(refund_amt) FROM pos_paid), 0) + COALESCE((SELECT SUM(amt) FROM refunded_elsewhere), 0),
    (SELECT COUNT(*) FROM pos_paid) + (SELECT COUNT(*) FROM deposits_at_creation) + (SELECT COUNT(*) FROM collected_elsewhere),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'cash'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'cash'), 0),
    COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'cash'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'card'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'card'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'store_credit'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'store_credit'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'loyalty_points'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'loyalty_points'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method IS NULL OR payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0)
  INTO
    v_repair_sales, v_repair_refunds, v_repair_tx_count,
    v_repair_cash_sales, v_repair_cash_deposits, v_repair_card_sales, v_repair_store_credit_sales, v_repair_loyalty_points_sales, v_repair_other_sales;

  v_expected := v_session.opening_float + v_cash_sales + v_repair_cash_deposits + v_credit_repayments_cash + v_cash_in - v_cash_out - v_cash_refunds;

  RETURN jsonb_build_object(
    'session_id',                  p_session_id,
    'total_sales',                 v_total_sales,
    'total_refunds',               v_total_refunds,
    'cash_sales',                  v_cash_sales,
    'card_sales',                  v_card_sales,
    'store_credit_sales',          v_store_credit_sales,
    'loyalty_points_sales',        v_loyalty_points_sales,
    'on_account_sales',            v_on_account_sales,
    'other_sales',                 v_other_sales,
    'transaction_count',           v_tx_count,
    'cash_in',                     v_cash_in,
    'cash_out',                    v_cash_out,
    'buyback_out',                 v_buyback_out,
    'credit_repayments_cash',      v_credit_repayments_cash,
    'credit_repayments_total',     v_credit_repayments_total,
    'opening_float',               v_session.opening_float,
    'expected_cash',               v_expected,
    'repair_sales',                v_repair_sales,
    'repair_refunds',              v_repair_refunds,
    'repair_transaction_count',    v_repair_tx_count,
    'repair_cash_sales',           v_repair_cash_sales,
    'repair_card_sales',           v_repair_card_sales,
    'repair_store_credit_sales',   v_repair_store_credit_sales,
    'repair_loyalty_points_sales', v_repair_loyalty_points_sales,
    'repair_other_sales',          v_repair_other_sales,
    'opened_at',                   v_session.opened_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION close_register_session(
  p_session_id   UUID,
  p_closing_cash NUMERIC,
  p_closing_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_session                    register_sessions%ROWTYPE;
  v_total_sales                NUMERIC := 0;
  v_total_refunds              NUMERIC := 0;
  v_cash_refunds                NUMERIC := 0;
  v_cash_sales                 NUMERIC := 0;
  v_card_sales                 NUMERIC := 0;
  v_store_credit_sales         NUMERIC := 0;
  v_loyalty_points_sales       NUMERIC := 0;
  v_on_account_sales           NUMERIC := 0;
  v_other_sales                NUMERIC := 0;
  v_tx_count                   INT     := 0;
  v_cash_in                    NUMERIC := 0;
  v_cash_out                   NUMERIC := 0;
  v_buyback_out                NUMERIC := 0;
  v_expected                   NUMERIC := 0;
  v_variance                   NUMERIC := 0;
  v_repair_sales                NUMERIC := 0;
  v_repair_refunds              NUMERIC := 0;
  v_repair_tx_count             INT     := 0;
  v_repair_cash_sales           NUMERIC := 0;
  v_repair_cash_deposits        NUMERIC := 0;
  v_repair_card_sales           NUMERIC := 0;
  v_repair_store_credit_sales   NUMERIC := 0;
  v_repair_loyalty_points_sales NUMERIC := 0;
  v_repair_other_sales          NUMERIC := 0;
  v_credit_repayments_cash      NUMERIC := 0;
  v_credit_repayments_total     NUMERIC := 0;
  v_credit_activity             JSONB;
BEGIN
  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  IF v_session.status = 'closed' THEN
    RAISE EXCEPTION 'Session already closed';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN is_refund = true  THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'cash'           AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'card'           AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'store_credit'   AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'loyalty_points' AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'on_account'     AND is_refund = false THEN amount_paid ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method NOT IN ('cash','card','store_credit','loyalty_points','on_account') AND is_refund = false THEN total ELSE 0 END), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN payment_method = 'cash' AND is_refund = true THEN total ELSE 0 END), 0)
  INTO
    v_total_sales, v_total_refunds,
    v_cash_sales, v_card_sales, v_store_credit_sales, v_loyalty_points_sales, v_on_account_sales, v_other_sales,
    v_tx_count, v_cash_refunds
  FROM sales
  WHERE branch_id = v_session.branch_id
    AND created_at >= v_session.opened_at
    AND created_at <= NOW();

  SELECT
    COALESCE(SUM(CASE WHEN type = 'cash_in'  THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_out' AND purpose = 'buyback' THEN amount ELSE 0 END), 0)
  INTO v_cash_in, v_cash_out, v_buyback_out
  FROM cash_movements
  WHERE session_id = p_session_id;

  SELECT
    COALESCE(SUM(CASE WHEN sp.method = 'cash' THEN sp.amount ELSE 0 END), 0),
    COALESCE(SUM(sp.amount), 0)
  INTO v_credit_repayments_cash, v_credit_repayments_total
  FROM sale_payments sp
  JOIN sales s ON s.id = sp.sale_id
  WHERE s.branch_id = v_session.branch_id
    AND sp.created_at >= v_session.opened_at
    AND sp.created_at <= NOW()
    AND s.created_at < v_session.opened_at;

  v_on_account_sales := v_on_account_sales + v_credit_repayments_total;

  WITH pos_paid AS (
    SELECT si.repair_id,
           SUM(CASE WHEN s.is_refund = false THEN si.total ELSE 0 END) AS amt,
           SUM(CASE WHEN s.is_refund = true  THEN si.total ELSE 0 END) AS refund_amt,
           MAX(s.payment_method) AS payment_method
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.branch_id = v_session.branch_id
      AND si.repair_id IS NOT NULL
      AND s.created_at >= v_session.opened_at
      AND s.created_at <= NOW()
    GROUP BY si.repair_id
  ),
  deposits_at_creation AS (
    SELECT r.id AS repair_id, r.deposit_paid AS amt,
           COALESCE(r.custom_fields->>'payment_method', '') AS payment_method
    FROM repairs r
    WHERE r.branch_id = v_session.branch_id
      AND r.created_at >= v_session.opened_at
      AND r.created_at <= NOW()
      AND COALESCE(r.deposit_paid, 0) > 0
  ),
  collected_elsewhere AS (
    SELECT DISTINCT ON (rsh.repair_id) rsh.repair_id,
           GREATEST(COALESCE(r.actual_cost, r.estimated_cost, 0) - COALESCE(r.deposit_paid, 0), 0) AS amt
    FROM repair_status_history rsh
    JOIN repairs r ON r.id = rsh.repair_id
    WHERE r.branch_id = v_session.branch_id
      AND is_repair_status_collected(rsh.new_status)
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
      AND is_repair_status_refunded(rsh.new_status)
      AND rsh.created_at >= v_session.opened_at
      AND rsh.created_at <= NOW()
      AND rsh.repair_id NOT IN (SELECT repair_id FROM pos_paid)
    ORDER BY rsh.repair_id, rsh.created_at ASC
  )
  SELECT
    COALESCE((SELECT SUM(amt)        FROM pos_paid), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0),
    COALESCE((SELECT SUM(refund_amt) FROM pos_paid), 0) + COALESCE((SELECT SUM(amt) FROM refunded_elsewhere), 0),
    (SELECT COUNT(*) FROM pos_paid) + (SELECT COUNT(*) FROM deposits_at_creation) + (SELECT COUNT(*) FROM collected_elsewhere),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'cash'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'cash'), 0),
    COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'cash'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'card'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'card'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'store_credit'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'store_credit'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'loyalty_points'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'loyalty_points'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method IS NULL OR payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0)
  INTO
    v_repair_sales, v_repair_refunds, v_repair_tx_count,
    v_repair_cash_sales, v_repair_cash_deposits, v_repair_card_sales, v_repair_store_credit_sales, v_repair_loyalty_points_sales, v_repair_other_sales;

  v_expected := v_session.opening_float + v_cash_sales + v_repair_cash_deposits + v_credit_repayments_cash + v_cash_in - v_cash_out - v_cash_refunds;
  v_variance := p_closing_cash - v_expected;

  v_credit_activity := register_session_credit_activity(v_session.business_id, v_session.branch_id, v_session.opened_at);

  UPDATE register_sessions SET
    closing_cash                  = p_closing_cash,
    closing_note                  = p_closing_note,
    expected_cash                 = v_expected,
    variance                      = v_variance,
    total_sales                   = v_total_sales,
    total_refunds                 = v_total_refunds,
    cash_sales                    = v_cash_sales,
    card_sales                    = v_card_sales,
    store_credit_sales            = v_store_credit_sales,
    loyalty_points_sales          = v_loyalty_points_sales,
    on_account_sales              = v_on_account_sales,
    other_sales                   = v_other_sales,
    transaction_count             = v_tx_count,
    cash_in_total                 = v_cash_in,
    cash_out_total                = v_cash_out,
    repair_sales                  = v_repair_sales,
    repair_refunds                = v_repair_refunds,
    repair_transaction_count      = v_repair_tx_count,
    repair_cash_sales             = v_repair_cash_sales,
    repair_card_sales             = v_repair_card_sales,
    repair_store_credit_sales     = v_repair_store_credit_sales,
    repair_loyalty_points_sales   = v_repair_loyalty_points_sales,
    repair_other_sales            = v_repair_other_sales,
    credit_activity                = v_credit_activity,
    closed_at                      = NOW(),
    status                          = 'closed'
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id',                 p_session_id,
    'total_sales',                v_total_sales,
    'total_refunds',              v_total_refunds,
    'cash_sales',                 v_cash_sales,
    'card_sales',                 v_card_sales,
    'store_credit_sales',         v_store_credit_sales,
    'loyalty_points_sales',       v_loyalty_points_sales,
    'on_account_sales',           v_on_account_sales,
    'other_sales',                v_other_sales,
    'transaction_count',          v_tx_count,
    'cash_in',                    v_cash_in,
    'cash_out',                   v_cash_out,
    'buyback_out',                v_buyback_out,
    'credit_repayments_cash',     v_credit_repayments_cash,
    'credit_repayments_total',    v_credit_repayments_total,
    'opening_float',              v_session.opening_float,
    'closing_cash',               p_closing_cash,
    'expected_cash',              v_expected,
    'variance',                   v_variance,
    'repair_sales',               v_repair_sales,
    'repair_refunds',             v_repair_refunds,
    'repair_transaction_count',   v_repair_tx_count,
    'repair_cash_sales',          v_repair_cash_sales,
    'repair_card_sales',          v_repair_card_sales,
    'repair_store_credit_sales',  v_repair_store_credit_sales,
    'repair_loyalty_points_sales', v_repair_loyalty_points_sales,
    'repair_other_sales',         v_repair_other_sales,
    'credit_activity',            v_credit_activity,
    'grand_total',                v_total_sales + v_repair_sales - v_repair_refunds,
    'opened_at',                  v_session.opened_at,
    'closed_at',                  NOW()
  );
END;
$$;
