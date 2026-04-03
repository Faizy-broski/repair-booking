-- ============================================================
-- 027_fix_refunded_column_refs.sql
-- Fix references to non-existent "refunded" boolean column.
-- The sales table uses:
--   payment_status TEXT ('paid','refunded','partial')
--   is_refund      BOOLEAN (from 010_pos_refunds.sql)
-- ============================================================

-- ─── Fix close_register_session ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION close_register_session(
  p_session_id   UUID,
  p_closing_cash NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_session    register_sessions%ROWTYPE;
  v_total_sales NUMERIC := 0;
  v_total_refunds NUMERIC := 0;
  v_cash_sales  NUMERIC := 0;
  v_card_sales  NUMERIC := 0;
  v_other_sales NUMERIC := 0;
  v_tx_count    INT := 0;
  v_expected    NUMERIC := 0;
  v_variance    NUMERIC := 0;
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
    COALESCE(SUM(CASE WHEN payment_status != 'refunded' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_status  = 'refunded' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'cash'  AND payment_status != 'refunded' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'card'  AND payment_status != 'refunded' THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method NOT IN ('cash','card') AND payment_status != 'refunded' THEN total ELSE 0 END), 0),
    COUNT(*)
  INTO
    v_total_sales, v_total_refunds,
    v_cash_sales, v_card_sales, v_other_sales,
    v_tx_count
  FROM sales
  WHERE branch_id = v_session.branch_id
    AND created_at >= v_session.opened_at
    AND created_at <= NOW();

  v_expected := v_session.opening_float + v_cash_sales - v_total_refunds;
  v_variance := p_closing_cash - v_expected;

  UPDATE register_sessions SET
    closing_cash      = p_closing_cash,
    expected_cash     = v_expected,
    variance          = v_variance,
    total_sales       = v_total_sales,
    total_refunds     = v_total_refunds,
    cash_sales        = v_cash_sales,
    card_sales        = v_card_sales,
    other_sales       = v_other_sales,
    transaction_count = v_tx_count,
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
    'opening_float',     v_session.opening_float,
    'closing_cash',      p_closing_cash,
    'expected_cash',     v_expected,
    'variance',          v_variance,
    'opened_at',         v_session.opened_at,
    'closed_at',         NOW()
  );
END;
$$;

-- ─── Fix get_profit_loss ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_profit_loss(
  p_branch_id  UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_revenue   NUMERIC := 0;
  v_repairs   NUMERIC := 0;
  v_cogs      NUMERIC := 0;
  v_expenses  NUMERIC := 0;
  v_salaries  NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(total),0)
  INTO v_revenue
  FROM sales
  WHERE branch_id = p_branch_id
    AND payment_status != 'refunded'
    AND created_at::date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(actual_cost),0)
  INTO v_repairs
  FROM repairs
  WHERE branch_id = p_branch_id
    AND status = 'completed'
    AND updated_at::date BETWEEN p_start_date AND p_end_date;

  -- COGS: sum(sale_items.quantity * products.cost_price)
  SELECT COALESCE(SUM(si.quantity * COALESCE(p.cost_price, 0)), 0)
  INTO v_cogs
  FROM sale_items si
  JOIN sales s           ON s.id = si.sale_id
  JOIN products p        ON p.id = si.product_id
  WHERE s.branch_id = p_branch_id
    AND s.payment_status != 'refunded'
    AND s.created_at::date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(amount),0)
  INTO v_expenses
  FROM expenses
  WHERE branch_id = p_branch_id
    AND expense_date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(amount),0)
  INTO v_salaries
  FROM salaries
  WHERE branch_id = p_branch_id
    AND pay_date BETWEEN p_start_date AND p_end_date;

  RETURN jsonb_build_object(
    'revenue',      v_revenue,
    'repair_revenue', v_repairs,
    'total_revenue', v_revenue + v_repairs,
    'cogs',         v_cogs,
    'expenses',     v_expenses,
    'salaries',     v_salaries,
    'total_costs',  v_cogs + v_expenses + v_salaries,
    'gross_profit', (v_revenue + v_repairs) - v_cogs,
    'net_profit',   (v_revenue + v_repairs) - v_cogs - v_expenses - v_salaries
  );
END;
$$;
