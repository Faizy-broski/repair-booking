-- Migration 114: Shift Repair Sales
-- Adds repair revenue as a distinct, informational total in the shift
-- Z-Report, alongside the existing product-sales figures. Repair revenue
-- is NOT folded into cash expected/variance (repairs have no
-- payment_method, so we cannot tell whether a repair was paid in cash).

ALTER TABLE register_sessions
  ADD COLUMN IF NOT EXISTS repair_sales             NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repair_refunds            NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repair_transaction_count  INT           NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_repair_status_history_repair_created
  ON repair_status_history(repair_id, created_at DESC);

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

  -- Repairs collected in-window, scoped to this branch, deduped to the
  -- first qualifying "collected"/"refunded" transition per repair (a
  -- repair may bounce through collected -> reopened -> collected again
  -- within the same window; count it once).
  WITH collected AS (
    SELECT DISTINCT ON (rsh.repair_id) rsh.repair_id, r.actual_cost
    FROM repair_status_history rsh
    JOIN repairs r ON r.id = rsh.repair_id
    WHERE r.branch_id = v_session.branch_id
      AND rsh.new_status ILIKE 'collected'
      AND rsh.created_at >= v_session.opened_at
      AND rsh.created_at <= NOW()
    ORDER BY rsh.repair_id, rsh.created_at ASC
  ),
  refunded AS (
    SELECT DISTINCT ON (rsh.repair_id) rsh.repair_id, r.refund_amount
    FROM repair_status_history rsh
    JOIN repairs r ON r.id = rsh.repair_id
    WHERE r.branch_id = v_session.branch_id
      AND rsh.new_status ILIKE 'refunded'
      AND rsh.created_at >= v_session.opened_at
      AND rsh.created_at <= NOW()
    ORDER BY rsh.repair_id, rsh.created_at ASC
  )
  SELECT
    COALESCE((SELECT SUM(actual_cost)   FROM collected), 0),
    COALESCE((SELECT SUM(refund_amount) FROM refunded),  0),
    COALESCE((SELECT COUNT(*)           FROM collected), 0)
  INTO v_repair_sales, v_repair_refunds, v_repair_tx_count;

  -- Cash-drawer reconciliation stays product-cash-only: repairs have no
  -- payment_method, so we cannot know whether repair revenue entered the
  -- drawer as cash. A cash repair payment should be logged as a manual
  -- Cash In movement, which already flows into v_cash_in above.
  v_expected := v_session.opening_float + v_cash_sales + v_cash_in - v_cash_out - v_total_refunds;
  v_variance := p_closing_cash - v_expected;

  UPDATE register_sessions SET
    closing_cash             = p_closing_cash,
    closing_note             = p_closing_note,
    expected_cash            = v_expected,
    variance                 = v_variance,
    total_sales              = v_total_sales,
    total_refunds            = v_total_refunds,
    cash_sales                = v_cash_sales,
    card_sales                = v_card_sales,
    other_sales               = v_other_sales,
    transaction_count         = v_tx_count,
    cash_in_total              = v_cash_in,
    cash_out_total             = v_cash_out,
    repair_sales               = v_repair_sales,
    repair_refunds             = v_repair_refunds,
    repair_transaction_count   = v_repair_tx_count,
    closed_at                  = NOW(),
    status                     = 'closed'
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
