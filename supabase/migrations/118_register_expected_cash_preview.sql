-- Migration 118: Read-only preview of expected cash before ending a shift
--
-- The End Shift modal needs to tell the cashier the expected cash and the
-- live difference against what they've counted *before* they submit, so a
-- discrepancy reason can be required up front. close_register_session()
-- only computes expected_cash as part of actually closing the session
-- (UPDATE + status change), so there was no read-only way to get this value
-- ahead of time.
--
-- This duplicates the SELECT-only aggregation from close_register_session()
-- (migration 117) rather than refactoring it in place, to avoid touching a
-- function that's already closing real shifts in production. If the
-- expected-cash calculation ever changes, both functions must be updated
-- together.

CREATE OR REPLACE FUNCTION register_session_expected(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_session            register_sessions%ROWTYPE;
  v_total_sales        NUMERIC := 0;
  v_total_refunds      NUMERIC := 0;
  v_cash_sales         NUMERIC := 0;
  v_card_sales         NUMERIC := 0;
  v_other_sales        NUMERIC := 0;
  v_tx_count           INT     := 0;
  v_cash_in            NUMERIC := 0;
  v_cash_out           NUMERIC := 0;
  v_expected           NUMERIC := 0;
  v_repair_sales       NUMERIC := 0;
  v_repair_refunds     NUMERIC := 0;
  v_repair_tx_count    INT     := 0;
  v_repair_cash_sales  NUMERIC := 0;
  v_repair_card_sales  NUMERIC := 0;
  v_repair_other_sales NUMERIC := 0;
BEGIN
  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
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

  -- Repair sales (see migration 117 for the full rationale on each CTE)
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
    COALESCE((SELECT SUM(amt)        FROM pos_paid), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0),
    COALESCE((SELECT SUM(refund_amt) FROM pos_paid), 0) + COALESCE((SELECT SUM(amt) FROM refunded_elsewhere), 0),
    (SELECT COUNT(*) FROM pos_paid) + (SELECT COUNT(*) FROM deposits_at_creation) + (SELECT COUNT(*) FROM collected_elsewhere),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'cash'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'cash'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'card'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'card'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method IS NULL OR payment_method NOT IN ('cash','card')), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method NOT IN ('cash','card')), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0)
  INTO
    v_repair_sales, v_repair_refunds, v_repair_tx_count,
    v_repair_cash_sales, v_repair_card_sales, v_repair_other_sales;

  v_expected := v_session.opening_float + v_cash_sales + v_cash_in - v_cash_out - v_total_refunds;

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
    'expected_cash',             v_expected,
    'repair_sales',              v_repair_sales,
    'repair_refunds',            v_repair_refunds,
    'repair_transaction_count',  v_repair_tx_count,
    'repair_cash_sales',         v_repair_cash_sales,
    'repair_card_sales',         v_repair_card_sales,
    'repair_other_sales',        v_repair_other_sales,
    'opened_at',                 v_session.opened_at
  );
END;
$$;
