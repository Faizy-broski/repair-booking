-- Migration 169: Fix live "Repair Sales" tile missing deposits/top-ups.
--
-- register_session_expected() (the live-session preview shown while the
-- till is still open) was last redefined in migration 134, BEFORE migration
-- 151 introduced the repair_payments ledger and switched
-- close_register_session() to source repair revenue from it. 134's
-- deposits_at_creation CTE filters by repairs.created_at (booking time), so
-- a deposit or top-up paid during the current shift on a repair that was
-- BOOKED before the shift opened silently drops out of the live tile, even
-- though close_register_session (via repair_payments.created_at, the actual
-- payment-event time) would correctly count it at close-out. This fixes
-- register_session_expected to use the same repair_payments-based logic,
-- so the live tile and the final Z-report agree.

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

  -- Product Sales / Refunds: sale total minus whatever portion of that sale
  -- is repair-linked (rp.repair_amt), so it never overlaps with Repair Sales.
  SELECT
    COALESCE(SUM(CASE WHEN s.is_refund = false THEN s.total - COALESCE(rp.repair_amt, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN s.is_refund = true  THEN s.total - COALESCE(rp.repair_amt, 0) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN s.payment_method = 'cash'           AND s.is_refund = false THEN s.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN s.payment_method = 'card'           AND s.is_refund = false THEN s.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN s.payment_method = 'store_credit'   AND s.is_refund = false THEN s.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN s.payment_method = 'loyalty_points' AND s.is_refund = false THEN s.total ELSE 0 END), 0),
    -- Deposit actually collected, not the full receivable.
    COALESCE(SUM(CASE WHEN s.payment_method = 'on_account'     AND s.is_refund = false THEN s.amount_paid ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN s.payment_method NOT IN ('cash','card','store_credit','loyalty_points','on_account') AND s.is_refund = false THEN s.total ELSE 0 END), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN s.payment_method = 'cash' AND s.is_refund = true THEN s.total ELSE 0 END), 0)
  INTO
    v_total_sales, v_total_refunds,
    v_cash_sales, v_card_sales, v_store_credit_sales, v_loyalty_points_sales, v_on_account_sales, v_other_sales,
    v_tx_count, v_cash_refunds
  FROM sales s
  LEFT JOIN (
    SELECT sale_id, SUM(total) AS repair_amt
    FROM sale_items
    WHERE repair_id IS NOT NULL
    GROUP BY sale_id
  ) rp ON rp.sale_id = s.id
  WHERE s.branch_id = v_session.branch_id
    AND s.created_at >= v_session.opened_at
    AND s.created_at <= NOW();

  SELECT
    COALESCE(SUM(CASE WHEN type = 'cash_in'  THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_out' AND purpose = 'buyback' THEN amount ELSE 0 END), 0)
  INTO v_cash_in, v_cash_out, v_buyback_out
  FROM cash_movements
  WHERE session_id = p_session_id;

  -- Same-day repayments collected against sales created in a PRIOR session.
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

  -- Repair sales: mirrors close_register_session (migration 151) — sourced
  -- from repair_payments (the actual payment-event ledger, keyed by when the
  -- cash/card/etc. was collected), not repairs.created_at (booking time).
  -- This is what lets a deposit or top-up paid during THIS shift count
  -- toward this shift, even if the job itself was booked earlier.
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
  repair_payments_in_window AS (
    SELECT rp.repair_id, rp.amount AS amt, rp.method AS payment_method
    FROM repair_payments rp
    JOIN repairs r ON r.id = rp.repair_id
    WHERE r.branch_id = v_session.branch_id
      AND rp.created_at >= v_session.opened_at
      AND rp.created_at <= NOW()
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
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0),
    COALESCE((SELECT SUM(refund_amt) FROM pos_paid), 0) + COALESCE((SELECT SUM(amt) FROM refunded_elsewhere), 0),
    (SELECT COUNT(*) FROM pos_paid) + (SELECT COUNT(*) FROM repair_payments_in_window) + (SELECT COUNT(*) FROM collected_elsewhere),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'cash'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'cash'), 0),
    COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'cash'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'card'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'card'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'store_credit'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'store_credit'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'loyalty_points'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'loyalty_points'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method IS NULL OR payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
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
