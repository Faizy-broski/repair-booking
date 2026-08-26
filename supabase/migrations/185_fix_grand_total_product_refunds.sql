-- Migration 185: "Grand Total" on the Z-report / close-register summary
-- overstated revenue because it never netted product refunds.
--
-- close_register_session() built grand_total as
--   v_total_sales + v_repair_sales - v_repair_refunds
-- which subtracts repair refunds but omits v_total_refunds (refunds on
-- plain, non-repair product sales) even though v_total_refunds is already
-- computed in the very same function a few lines earlier. Any refunded
-- product sale during the shift made the headline "Total" figure shown next
-- to Expected Cash overstate revenue by the refunded amount — a visible
-- inconsistency (the "Refunds" cash-flow tile in the same modal DID show the
-- refund correctly) that undermines trust in the numbers even though it
-- never touched expected_cash itself.
--
-- register_session_expected (the live preview) does not emit a grand_total
-- field at all, so there is nothing to fix there — but per the established
-- pattern (see 172/173/184) both functions are still redefined together in
-- one migration so this file remains the single current source of truth for
-- both, and the rest of the formula stays byte-identical to migration 184.

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
  v_split_tender_cash          NUMERIC := 0;
  v_expected                   NUMERIC := 0;
  v_repair_sales                NUMERIC := 0;
  v_repair_refunds              NUMERIC := 0;
  v_repair_cash_refunds         NUMERIC := 0;
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

  -- Cash tendered as part of a split-tender sale (partial on_account deposit
  -- or a fully-paid mixed cash+card 'split' sale) — the sales.payment_method
  -- column only ever holds ONE value per sale, so this cash is otherwise
  -- invisible to v_cash_sales above. Excludes payment_method = 'cash' sales
  -- since their full total is already counted there and payment_splits is
  -- expected to be empty for them.
  SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
  INTO v_split_tender_cash
  FROM sales s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.payment_splits, '[]'::jsonb)) elem
  WHERE s.branch_id = v_session.branch_id
    AND s.is_refund = false
    AND s.payment_method <> 'cash'
    AND elem->>'method' = 'cash'
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

  -- Repair sales: mirrors close_register_session (migration 151/172) —
  -- sourced from repair_payments (the actual payment-event ledger, keyed by
  -- when the cash/card/etc. was collected), not repairs.created_at (booking
  -- time). This is what lets a deposit or top-up paid during THIS shift
  -- count toward this shift, even if the job itself was booked earlier.
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
  ),
  -- Cash portion of a repair refund: how much of this repair's *cash*
  -- payments (from repair_payments) is being handed back, capped at what
  -- was actually refunded (refunded_elsewhere.amt). A refund routed through
  -- the POS refund screen instead creates a `sales` row with an explicit
  -- payment_method and is already captured by v_cash_refunds above, so this
  -- only applies to refunds recorded via direct status change.
  repair_cash_refunded AS (
    SELECT re.repair_id,
           LEAST(
             re.amt,
             COALESCE((SELECT SUM(rp.amount) FROM repair_payments rp
                        WHERE rp.repair_id = re.repair_id AND rp.method = 'cash'), 0)
           ) AS cash_amt
    FROM refunded_elsewhere re
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
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0),
    COALESCE((SELECT SUM(cash_amt) FROM repair_cash_refunded), 0)
  INTO
    v_repair_sales, v_repair_refunds, v_repair_tx_count,
    v_repair_cash_sales, v_repair_cash_deposits, v_repair_card_sales, v_repair_store_credit_sales, v_repair_loyalty_points_sales, v_repair_other_sales,
    v_repair_cash_refunds;

  v_expected := v_session.opening_float + v_cash_sales + v_split_tender_cash + v_repair_cash_deposits
                + v_credit_repayments_cash + v_cash_in - v_cash_out - v_cash_refunds - v_repair_cash_refunds;

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
    'split_tender_cash',           v_split_tender_cash,
    'credit_repayments_cash',      v_credit_repayments_cash,
    'credit_repayments_total',     v_credit_repayments_total,
    'opening_float',               v_session.opening_float,
    'expected_cash',               v_expected,
    'repair_sales',                v_repair_sales,
    'repair_refunds',              v_repair_refunds,
    'repair_cash_refunds',         v_repair_cash_refunds,
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
  v_session                 register_sessions%ROWTYPE;
  v_total_sales              NUMERIC := 0;
  v_total_refunds             NUMERIC := 0;
  v_cash_refunds               NUMERIC := 0;
  v_cash_sales                  NUMERIC := 0;
  v_card_sales                   NUMERIC := 0;
  v_store_credit_sales            NUMERIC := 0;
  v_loyalty_points_sales           NUMERIC := 0;
  v_on_account_sales                NUMERIC := 0;
  v_other_sales                      NUMERIC := 0;
  v_tx_count                          INT     := 0;
  v_cash_in                            NUMERIC := 0;
  v_cash_out                            NUMERIC := 0;
  v_buyback_out                          NUMERIC := 0;
  v_split_tender_cash                     NUMERIC := 0;
  v_expected                              NUMERIC := 0;
  v_variance                               NUMERIC := 0;
  v_repair_sales                            NUMERIC := 0;
  v_repair_refunds                           NUMERIC := 0;
  v_repair_cash_refunds                      NUMERIC := 0;
  v_repair_tx_count                           INT     := 0;
  v_repair_cash_sales                          NUMERIC := 0;
  v_repair_cash_deposits                        NUMERIC := 0;
  v_repair_card_sales                            NUMERIC := 0;
  v_repair_store_credit_sales                     NUMERIC := 0;
  v_repair_loyalty_points_sales                    NUMERIC := 0;
  v_repair_other_sales                              NUMERIC := 0;
  v_credit_repayments_cash                           NUMERIC := 0;
  v_credit_repayments_total                           NUMERIC := 0;
BEGIN
  SELECT * INTO v_session FROM register_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;
  IF v_session.status = 'closed' THEN
    RAISE EXCEPTION 'Session already closed';
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

  -- Cash tendered as part of a split-tender sale (partial on_account deposit
  -- or a fully-paid mixed cash+card 'split' sale) — see comment in
  -- register_session_expected above; same gap, same fix, kept in sync.
  SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
  INTO v_split_tender_cash
  FROM sales s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.payment_splits, '[]'::jsonb)) elem
  WHERE s.branch_id = v_session.branch_id
    AND s.is_refund = false
    AND s.payment_method <> 'cash'
    AND elem->>'method' = 'cash'
    AND s.created_at >= v_session.opened_at
    AND s.created_at <= NOW();

  -- Aggregate cash movements for this session (global, not tied to sale type)
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

  -- Repair sales: payments recorded (via repair_payments) during this shift's
  -- window, plus any legacy POS-cart-paid repair line items (kept for
  -- historical/edge-case compatibility, but the app no longer creates these),
  -- plus repairs marked "Collected" directly in the Repairs module during
  -- this shift's window — credited for only the remaining balance, since the
  -- deposit/top-up portion was already credited via repair_payments.
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
  ),
  -- Cash portion of a repair refund — see comment in register_session_expected
  -- above; same gap, same fix, kept in sync.
  repair_cash_refunded AS (
    SELECT re.repair_id,
           LEAST(
             re.amt,
             COALESCE((SELECT SUM(rp.amount) FROM repair_payments rp
                        WHERE rp.repair_id = re.repair_id AND rp.method = 'cash'), 0)
           ) AS cash_amt
    FROM refunded_elsewhere re
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
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0),
    COALESCE((SELECT SUM(cash_amt) FROM repair_cash_refunded), 0)
  INTO
    v_repair_sales, v_repair_refunds, v_repair_tx_count,
    v_repair_cash_sales, v_repair_cash_deposits, v_repair_card_sales, v_repair_store_credit_sales, v_repair_loyalty_points_sales, v_repair_other_sales,
    v_repair_cash_refunds;

  v_expected := v_session.opening_float + v_cash_sales + v_split_tender_cash + v_repair_cash_deposits
                + v_credit_repayments_cash + v_cash_in - v_cash_out - v_cash_refunds - v_repair_cash_refunds;
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
    'split_tender_cash',           v_split_tender_cash,
    'credit_repayments_cash',      v_credit_repayments_cash,
    'credit_repayments_total',     v_credit_repayments_total,
    'opening_float',               v_session.opening_float,
    'closing_cash',                p_closing_cash,
    'expected_cash',               v_expected,
    'variance',                    v_variance,
    'repair_sales',                v_repair_sales,
    'repair_refunds',              v_repair_refunds,
    'repair_cash_refunds',         v_repair_cash_refunds,
    'repair_transaction_count',    v_repair_tx_count,
    'repair_cash_sales',           v_repair_cash_sales,
    'repair_card_sales',           v_repair_card_sales,
    'repair_store_credit_sales',   v_repair_store_credit_sales,
    'repair_loyalty_points_sales', v_repair_loyalty_points_sales,
    'repair_other_sales',          v_repair_other_sales,
    -- Fix: net out product refunds too, not just repair refunds (see header
    -- comment). Previously: v_total_sales + v_repair_sales - v_repair_refunds.
    'grand_total',                 v_total_sales + v_repair_sales - v_repair_refunds - v_total_refunds,
    'opened_at',                   v_session.opened_at,
    'closed_at',                   NOW()
  );
END;
$$;
