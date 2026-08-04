-- Adds split/multi-tender payment support to repairs, mirroring the existing
-- POS pattern: sales.payment_splits (migration 009) + sale_payments ledger
-- (migration 120). repairs.payment_splits is a cumulative snapshot across all
-- payment events (initial deposit + later top-ups); repair_payments is the
-- normalized per-event ledger used for reporting (Z-report tender split).

ALTER TABLE repairs
  ADD COLUMN payment_splits JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS repair_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  repair_id     UUID NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id),
  amount        NUMERIC(10,2) NOT NULL,
  method        TEXT NOT NULL,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- true for rows backfilled by this migration from the legacy single
  -- custom_fields.payment_method, where the original event date is
  -- approximated as the repair's created_at.
  is_backfilled BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_repair_payments_repair   ON repair_payments(repair_id);
CREATE INDEX IF NOT EXISTS idx_repair_payments_business ON repair_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_repair_payments_customer ON repair_payments(customer_id);

-- One-time backfill: give every existing repair with a deposit a ledger row +
-- matching payment_splits snapshot, sourced from the legacy single method
-- string. Makes repair_payments the single source of truth going forward —
-- no legacy/new branching needed in reporting code.
INSERT INTO repair_payments (business_id, repair_id, customer_id, amount, method, created_at, is_backfilled)
SELECT
  b.business_id,
  r.id,
  r.customer_id,
  r.deposit_paid,
  COALESCE(NULLIF(r.custom_fields->>'payment_method', ''), 'other'),
  r.created_at,
  true
FROM repairs r
JOIN branches b ON b.id = r.branch_id
WHERE COALESCE(r.deposit_paid, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM repair_payments rp WHERE rp.repair_id = r.id);

UPDATE repairs r
SET payment_splits = jsonb_build_array(
  jsonb_build_object(
    'method', COALESCE(NULLIF(r.custom_fields->>'payment_method', ''), 'other'),
    'amount', r.deposit_paid
  )
)
WHERE COALESCE(r.deposit_paid, 0) > 0
  AND r.payment_splits = '[]'::jsonb;

-- Redefine close_register_session() (originally from 117_repair_sales_tender_split.sql)
-- to fan out repair tender from repair_payments instead of a single
-- custom_fields.payment_method string keyed off repair creation time. This is
-- also an accuracy improvement: a top-up paid during today's shift now counts
-- toward today's shift even if the job itself was created earlier.
CREATE OR REPLACE FUNCTION close_register_session(
  p_session_id   UUID,
  p_closing_cash NUMERIC,
  p_closing_note TEXT DEFAULT NULL
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
  v_variance           NUMERIC := 0;
  v_repair_sales       NUMERIC := 0;
  v_repair_refunds     NUMERIC := 0;
  v_repair_tx_count    INT     := 0;
  v_repair_cash_sales  NUMERIC := 0;
  v_repair_card_sales  NUMERIC := 0;
  v_repair_other_sales NUMERIC := 0;
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

  -- Repair sales: payments recorded (via repair_payments) during this shift's
  -- window, plus any legacy POS-cart-paid repair line items (kept for
  -- historical/edge-case compatibility, but the app no longer creates these),
  -- plus repairs marked "Collected" directly in the Repairs module during
  -- this shift's window — credited for only the remaining balance, since the
  -- deposit/top-up portion was already credited via repair_payments.
  --
  -- Tender split: repair_payments and legacy pos_paid lines carry a method,
  -- so they're bucketed into cash/card/other. Pickup collections carry no
  -- tender data at all, so they always land in "other".
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
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0),
    COALESCE((SELECT SUM(refund_amt) FROM pos_paid), 0) + COALESCE((SELECT SUM(amt) FROM refunded_elsewhere), 0),
    (SELECT COUNT(*) FROM pos_paid) + (SELECT COUNT(*) FROM repair_payments_in_window) + (SELECT COUNT(*) FROM collected_elsewhere),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'cash'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'cash'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'card'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'card'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method IS NULL OR payment_method NOT IN ('cash','card')), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method NOT IN ('cash','card')), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0)
  INTO
    v_repair_sales, v_repair_refunds, v_repair_tx_count,
    v_repair_cash_sales, v_repair_card_sales, v_repair_other_sales;

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
    repair_cash_sales                  = v_repair_cash_sales,
    repair_card_sales                   = v_repair_card_sales,
    repair_other_sales                   = v_repair_other_sales,
    closed_at                              = NOW(),
    status                                  = 'closed'
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
    'repair_cash_sales',         v_repair_cash_sales,
    'repair_card_sales',         v_repair_card_sales,
    'repair_other_sales',        v_repair_other_sales,
    'grand_total',               v_total_sales + v_repair_sales - v_repair_refunds,
    'opened_at',                 v_session.opened_at,
    'closed_at',                 NOW()
  );
END;
$$;
