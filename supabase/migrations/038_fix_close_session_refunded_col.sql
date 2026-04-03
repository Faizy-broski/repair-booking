-- Fix: column is 'is_refund' not 'refunded' in close_register_session
CREATE OR REPLACE FUNCTION close_register_session(
  p_session_id   UUID,
  p_closing_cash NUMERIC,
  p_closing_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_session       register_sessions%ROWTYPE;
  v_total_sales   NUMERIC := 0;
  v_total_refunds NUMERIC := 0;
  v_cash_sales    NUMERIC := 0;
  v_card_sales    NUMERIC := 0;
  v_other_sales   NUMERIC := 0;
  v_tx_count      INT     := 0;
  v_cash_in       NUMERIC := 0;
  v_cash_out      NUMERIC := 0;
  v_expected      NUMERIC := 0;
  v_variance      NUMERIC := 0;
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

  -- Aggregate cash movements for this session
  SELECT
    COALESCE(SUM(CASE WHEN type = 'cash_in'  THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'cash_out' THEN amount ELSE 0 END), 0)
  INTO v_cash_in, v_cash_out
  FROM cash_movements
  WHERE session_id = p_session_id;

  v_expected := v_session.opening_float + v_cash_sales + v_cash_in - v_cash_out - v_total_refunds;
  v_variance := p_closing_cash - v_expected;

  UPDATE register_sessions SET
    closing_cash      = p_closing_cash,
    closing_note      = p_closing_note,
    expected_cash     = v_expected,
    variance          = v_variance,
    total_sales       = v_total_sales,
    total_refunds     = v_total_refunds,
    cash_sales        = v_cash_sales,
    card_sales        = v_card_sales,
    other_sales       = v_other_sales,
    transaction_count = v_tx_count,
    cash_in_total     = v_cash_in,
    cash_out_total    = v_cash_out,
    closed_at         = NOW(),
    status            = 'closed'
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'session_id',        p_session_id,
    'total_sales',       v_total_sales,
    'total_refunds',     v_total_refunds,
    'cash_sales',        v_cash_sales,
    'card_sales',        v_card_sales,
    'other_sales',       v_other_sales,
    'transaction_count', v_tx_count,
    'cash_in',           v_cash_in,
    'cash_out',          v_cash_out,
    'opening_float',     v_session.opening_float,
    'closing_cash',      p_closing_cash,
    'expected_cash',     v_expected,
    'variance',          v_variance,
    'opened_at',         v_session.opened_at,
    'closed_at',         NOW()
  );
END;
$$;
