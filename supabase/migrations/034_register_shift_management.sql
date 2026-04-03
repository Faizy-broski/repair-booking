-- Migration 034: Register Shift Management
-- Adds: cash movements (Cash In/Out), session members (Join Shift),
--       denomination breakdown, opening/closing notes, updated close function

-- ── Extend register_sessions ───────────────────────────────────────────────────
ALTER TABLE register_sessions
  ADD COLUMN IF NOT EXISTS opening_note           TEXT,
  ADD COLUMN IF NOT EXISTS closing_note           TEXT,
  ADD COLUMN IF NOT EXISTS opening_denominations  JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS closing_denominations  JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cash_in_total          NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_out_total         NUMERIC(10,2) DEFAULT 0;

-- ── Cash Movements (Cash In / Cash Out during a shift) ─────────────────────────
CREATE TABLE IF NOT EXISTS cash_movements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES register_sessions(id) ON DELETE CASCADE,
  branch_id    UUID NOT NULL REFERENCES branches(id)          ON DELETE CASCADE,
  business_id  UUID NOT NULL REFERENCES businesses(id)        ON DELETE CASCADE,
  cashier_id   UUID NOT NULL REFERENCES profiles(id),
  type         TEXT NOT NULL CHECK (type IN ('cash_in', 'cash_out')),
  amount       NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_type TEXT NOT NULL DEFAULT 'cash',
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_branch  ON cash_movements(branch_id, created_at DESC);

ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_movements_business_isolation" ON cash_movements
  USING (
    business_id IN (
      SELECT b.id FROM businesses b
      JOIN profiles p ON p.business_id = b.id
      WHERE p.id = auth.uid()
    )
  );

-- ── Register Session Members (Join Shift) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS register_session_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES register_sessions(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_session_members_session ON register_session_members(session_id);
CREATE INDEX IF NOT EXISTS idx_session_members_profile ON register_session_members(profile_id);

ALTER TABLE register_session_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_members_allow_all_authenticated" ON register_session_members
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── Update close_register_session to account for cash movements ───────────────
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
