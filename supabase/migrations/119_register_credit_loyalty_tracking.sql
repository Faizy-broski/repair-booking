-- Migration 119: Break out store credit / loyalty points in the Z-Report,
-- and add a session-scoped audit trail of credit/loyalty redemptions.
--
-- close_register_session() (migration 117) buckets sales into cash/card/
-- "other" by payment_method. Since 'store_credit' and 'loyalty_points' are
-- valid payment_method values (migration 113), they were silently lumped
-- into "other", indistinguishable from vouchers/gift cards/on-account. This
-- migration gives them their own columns, and adds a `credit_activity` JSONB
-- column listing exactly which customers redeemed store credit or loyalty
-- points during the shift (joined from store_credit_transactions /
-- loyalty_transactions, which already record every redemption accurately —
-- see StoreCreditService.debit / LoyaltyService.redeemPoints, called from
-- both POS checkout and repair creation/updates).

ALTER TABLE register_sessions
  ADD COLUMN IF NOT EXISTS store_credit_sales          NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_points_sales         NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repair_store_credit_sales     NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repair_loyalty_points_sales    NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_activity                 JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Shared by both close_register_session() and register_session_expected():
-- every store-credit debit / loyalty redemption during the session window,
-- scoped to this branch via the sale/repair the redemption was applied to.
CREATE OR REPLACE FUNCTION register_session_credit_activity(
  p_business_id UUID,
  p_branch_id   UUID,
  p_opened_at   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_activity JSONB;
BEGIN
  WITH credit_events AS (
    SELECT
      'store_credit'::text AS type,
      t.customer_id, t.amount, t.reference_type, t.reference_id, t.note, t.created_at,
      COALESCE(s.branch_id, r.branch_id) AS branch_id
    FROM store_credit_transactions t
    LEFT JOIN sales   s ON t.reference_type = 'sale'   AND s.id = t.reference_id
    LEFT JOIN repairs r ON t.reference_type = 'repair' AND r.id = t.reference_id
    WHERE t.business_id = p_business_id
      AND t.type = 'debit'
      AND t.created_at >= p_opened_at
      AND t.created_at <= NOW()

    UNION ALL

    SELECT
      'loyalty_points'::text AS type,
      lt.customer_id, lt.points AS amount, lt.reference_type, lt.reference_id, NULL::text AS note, lt.created_at,
      COALESCE(s.branch_id, r.branch_id) AS branch_id
    FROM loyalty_transactions lt
    LEFT JOIN sales   s ON lt.reference_type = 'sale'   AND s.id = lt.reference_id
    LEFT JOIN repairs r ON lt.reference_type = 'repair' AND r.id = lt.reference_id
    WHERE lt.business_id = p_business_id
      AND lt.type = 'redeemed'
      AND lt.created_at >= p_opened_at
      AND lt.created_at <= NOW()
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'type',           ce.type,
      'customer_name',  TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')),
      'amount',         ABS(ce.amount),
      'reference_type', ce.reference_type,
      'reference_id',   ce.reference_id,
      'note',           ce.note,
      'created_at',     ce.created_at
    ) ORDER BY ce.created_at
  ), '[]'::jsonb)
  INTO v_activity
  FROM credit_events ce
  JOIN customers c ON c.id = ce.customer_id
  WHERE ce.branch_id = p_branch_id;

  RETURN v_activity;
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
  v_cash_sales                 NUMERIC := 0;
  v_card_sales                 NUMERIC := 0;
  v_store_credit_sales         NUMERIC := 0;
  v_loyalty_points_sales       NUMERIC := 0;
  v_other_sales                NUMERIC := 0;
  v_tx_count                   INT     := 0;
  v_cash_in                    NUMERIC := 0;
  v_cash_out                   NUMERIC := 0;
  v_expected                   NUMERIC := 0;
  v_variance                   NUMERIC := 0;
  v_repair_sales                NUMERIC := 0;
  v_repair_refunds              NUMERIC := 0;
  v_repair_tx_count             INT     := 0;
  v_repair_cash_sales           NUMERIC := 0;
  v_repair_card_sales           NUMERIC := 0;
  v_repair_store_credit_sales   NUMERIC := 0;
  v_repair_loyalty_points_sales NUMERIC := 0;
  v_repair_other_sales          NUMERIC := 0;
  v_credit_activity             JSONB;
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
    COALESCE(SUM(CASE WHEN payment_method = 'cash'           AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'card'           AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'store_credit'   AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'loyalty_points' AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method NOT IN ('cash','card','store_credit','loyalty_points') AND is_refund = false THEN total ELSE 0 END), 0),
    COUNT(*)
  INTO
    v_total_sales, v_total_refunds,
    v_cash_sales, v_card_sales, v_store_credit_sales, v_loyalty_points_sales, v_other_sales,
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

  -- Repair sales: deposits taken at job-creation time this shift, plus any
  -- legacy POS-cart-paid repair line items (kept for historical/edge-case
  -- compatibility, but the app no longer creates these), plus repairs
  -- marked "Collected" directly in the Repairs module during this shift's
  -- window — credited for only the remaining balance, since the deposit
  -- portion was already credited (to whichever shift created the job).
  --
  -- Tender split: deposits and legacy pos_paid lines carry a payment_method,
  -- so they're bucketed into cash/card/store_credit/loyalty_points/other.
  -- Pickup collections carry no tender data at all, so they always land in
  -- "other".
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
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'store_credit'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'store_credit'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'loyalty_points'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'loyalty_points'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method IS NULL OR payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0)
  INTO
    v_repair_sales, v_repair_refunds, v_repair_tx_count,
    v_repair_cash_sales, v_repair_card_sales, v_repair_store_credit_sales, v_repair_loyalty_points_sales, v_repair_other_sales;

  -- Cash-drawer reconciliation stays product-cash-only: repairs have no
  -- payment_method on the drawer side, so we cannot know whether repair
  -- revenue entered the drawer as cash. A cash repair payment should be
  -- logged as a manual Cash In movement, which already flows into v_cash_in.
  -- Store credit / loyalty payments never touch the drawer either way.
  v_expected := v_session.opening_float + v_cash_sales + v_cash_in - v_cash_out - v_total_refunds;
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
    'other_sales',                v_other_sales,
    'transaction_count',          v_tx_count,
    'cash_in',                    v_cash_in,
    'cash_out',                   v_cash_out,
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
  v_cash_sales                 NUMERIC := 0;
  v_card_sales                 NUMERIC := 0;
  v_store_credit_sales         NUMERIC := 0;
  v_loyalty_points_sales       NUMERIC := 0;
  v_other_sales                NUMERIC := 0;
  v_tx_count                   INT     := 0;
  v_cash_in                    NUMERIC := 0;
  v_cash_out                   NUMERIC := 0;
  v_expected                   NUMERIC := 0;
  v_repair_sales                NUMERIC := 0;
  v_repair_refunds              NUMERIC := 0;
  v_repair_tx_count             INT     := 0;
  v_repair_cash_sales           NUMERIC := 0;
  v_repair_card_sales           NUMERIC := 0;
  v_repair_store_credit_sales   NUMERIC := 0;
  v_repair_loyalty_points_sales NUMERIC := 0;
  v_repair_other_sales          NUMERIC := 0;
BEGIN
  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  -- Aggregate sales since session opened
  SELECT
    COALESCE(SUM(CASE WHEN is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN is_refund = true  THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'cash'           AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'card'           AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'store_credit'   AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method = 'loyalty_points' AND is_refund = false THEN total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN payment_method NOT IN ('cash','card','store_credit','loyalty_points') AND is_refund = false THEN total ELSE 0 END), 0),
    COUNT(*)
  INTO
    v_total_sales, v_total_refunds,
    v_cash_sales, v_card_sales, v_store_credit_sales, v_loyalty_points_sales, v_other_sales,
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

  -- Repair sales (see migration 117/119 for the full rationale on each CTE)
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
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'store_credit'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'store_credit'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'loyalty_points'), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method = 'loyalty_points'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method IS NULL OR payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM deposits_at_creation WHERE payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0)
  INTO
    v_repair_sales, v_repair_refunds, v_repair_tx_count,
    v_repair_cash_sales, v_repair_card_sales, v_repair_store_credit_sales, v_repair_loyalty_points_sales, v_repair_other_sales;

  v_expected := v_session.opening_float + v_cash_sales + v_cash_in - v_cash_out - v_total_refunds;

  RETURN jsonb_build_object(
    'session_id',                  p_session_id,
    'total_sales',                 v_total_sales,
    'total_refunds',               v_total_refunds,
    'cash_sales',                  v_cash_sales,
    'card_sales',                  v_card_sales,
    'store_credit_sales',          v_store_credit_sales,
    'loyalty_points_sales',        v_loyalty_points_sales,
    'other_sales',                 v_other_sales,
    'transaction_count',           v_tx_count,
    'cash_in',                     v_cash_in,
    'cash_out',                    v_cash_out,
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
