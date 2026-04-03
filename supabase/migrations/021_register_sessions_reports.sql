-- Migration 021: Register Sessions (Z-Report) + Saved Reports (Custom Report Builder)

-- ─── Register Sessions (POS cash drawer management) ─────────────────────────
CREATE TABLE IF NOT EXISTS register_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id      UUID NOT NULL REFERENCES branches(id)  ON DELETE CASCADE,
  cashier_id     UUID NOT NULL REFERENCES profiles(id),
  opening_float  NUMERIC(10,2) NOT NULL DEFAULT 0,
  closing_cash   NUMERIC(10,2),
  expected_cash  NUMERIC(10,2),
  variance       NUMERIC(10,2),
  -- Snapshot totals captured on close
  total_sales    NUMERIC(10,2),
  total_refunds  NUMERIC(10,2),
  cash_sales     NUMERIC(10,2),
  card_sales     NUMERIC(10,2),
  other_sales    NUMERIC(10,2),
  transaction_count INT,
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at      TIMESTAMPTZ,
  status         TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','closed'))
);

CREATE INDEX IF NOT EXISTS idx_register_sessions_branch  ON register_sessions(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_register_sessions_cashier ON register_sessions(cashier_id);
CREATE INDEX IF NOT EXISTS idx_register_sessions_opened  ON register_sessions(opened_at DESC);

ALTER TABLE register_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "register_sessions_business_isolation" ON register_sessions
  USING (
    business_id IN (
      SELECT b.id FROM businesses b
      JOIN profiles p ON p.business_id = b.id
      WHERE p.id = auth.uid()
    )
  );

-- ─── Saved Reports (Custom Report Builder persistence) ───────────────────────
CREATE TABLE IF NOT EXISTS saved_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES profiles(id),
  name        TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'custom'
              CHECK (report_type IN ('sales','repairs','inventory','employees','custom')),
  config      JSONB NOT NULL DEFAULT '{}',
  -- config structure:
  -- { columns: [], filters: [], groupBy: [], dateField: '', sortBy: '', sortDir: 'asc' }
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_business ON saved_reports(business_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_creator  ON saved_reports(created_by);

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_reports_business_isolation" ON saved_reports
  USING (
    business_id IN (
      SELECT b.id FROM businesses b
      JOIN profiles p ON p.business_id = b.id
      WHERE p.id = auth.uid()
    )
  );

-- ─── DB function: close_register_session ─────────────────────────────────────
-- Atomically computes totals from sales, sets variance, marks session closed.
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
    COALESCE(SUM(CASE WHEN refunded = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN refunded = true  THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'cash'  AND refunded = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'card'  AND refunded = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method NOT IN ('cash','card') AND refunded = false THEN total ELSE 0 END), 0),
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

-- ─── DB function: get_profit_loss ─────────────────────────────────────────────
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
    AND refunded = false
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
    AND s.refunded = false
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
