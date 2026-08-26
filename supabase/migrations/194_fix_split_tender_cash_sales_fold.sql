-- Migration 194: Split-tender's CASH leg was never folded into v_cash_sales
-- (only the card and "other" legs were) — a real, previously-undetected bug
-- carried unchanged from migration 189 through 190.
--
-- Root cause: migrations 189/190 recover each leg of a split-tender sale
-- (payment_splits JSONB) into v_split_tender_cash/card/other, then fold
-- v_split_tender_card into v_card_sales and v_split_tender_other into
-- v_other_sales -- but never fold v_split_tender_cash into v_cash_sales.
-- v_split_tender_cash was only ever added directly into the v_expected
-- (Expected Cash) formula, so Expected Cash was correct all along, but the
-- "Cash Sales" tile (and the cash_sales JSON field every UI reads) silently
-- dropped every split-tender sale's cash leg. Example: a €120 sale tendered
-- as €100 cash + €20 card showed Card Sales = €20 (correct) and Cash Sales =
-- €0 (wrong -- should be €100).
--
-- Fix: fold v_split_tender_cash into v_cash_sales too, mirroring the
-- existing card/other folds exactly. Since v_cash_sales now already
-- contains the split-tender cash leg, the v_expected formula's separate
-- "+ v_split_tender_cash" term must be dropped in the same change --
-- otherwise that leg would be counted twice in Expected Cash. Net effect:
-- Expected Cash is unchanged (same total, now assembled from v_cash_sales
-- instead of v_cash_sales + v_split_tender_cash separately); only the
-- Cash Sales tile changes, and only upward, to the correct value.
--
-- Both functions copied verbatim from migration 190, with only these two
-- surgical changes (the fold line, and the expected-cash formula), per the
-- "keep both in sync" convention established since migration 172.

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
  v_card_refunds                NUMERIC := 0;
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
  v_split_tender_card          NUMERIC := 0;
  v_split_tender_other         NUMERIC := 0;
  v_expected                   NUMERIC := 0;
  v_repair_sales                NUMERIC := 0;
  v_repair_refunds              NUMERIC := 0;
  v_repair_cash_refunds         NUMERIC := 0;
  v_repair_card_refunds         NUMERIC := 0;
  v_repair_tx_count             INT     := 0;
  v_repair_cash_sales           NUMERIC := 0;
  v_repair_cash_deposits        NUMERIC := 0;
  v_repair_card_deposits        NUMERIC := 0;
  v_repair_card_sales           NUMERIC := 0;
  v_repair_store_credit_sales   NUMERIC := 0;
  v_repair_loyalty_points_sales NUMERIC := 0;
  v_repair_other_sales          NUMERIC := 0;
  v_credit_repayments_cash      NUMERIC := 0;
  v_credit_repayments_card      NUMERIC := 0;
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
    -- 'split' excluded here too -- its legs are recovered separately below
    -- (v_split_tender_cash/card/other) and folded in after this block, so
    -- counting the full split total here as well would double-count it.
    COALESCE(SUM(CASE WHEN s.payment_method NOT IN ('cash','card','store_credit','loyalty_points','on_account','split') AND s.is_refund = false THEN s.total ELSE 0 END), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN s.payment_method = 'cash' AND s.is_refund = true THEN s.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN s.payment_method = 'card' AND s.is_refund = true THEN s.total ELSE 0 END), 0)
  INTO
    v_total_sales, v_total_refunds,
    v_cash_sales, v_card_sales, v_store_credit_sales, v_loyalty_points_sales, v_on_account_sales, v_other_sales,
    v_tx_count, v_cash_refunds, v_card_refunds
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

  -- Cash/card/other tendered as part of a split-tender sale (partial
  -- on_account deposit, or a fully-paid mixed cash+card 'split' sale) — the
  -- sales.payment_method column only ever holds ONE value per sale, so this
  -- is otherwise invisible to v_cash_sales/v_card_sales above. Excludes
  -- payment_method = 'cash' sales since their full total is already counted
  -- there and payment_splits is expected to be empty for them. Kept broad
  -- (not narrowed to payment_method = 'split') so it still recovers a
  -- cash-tendered on_account deposit's leg the same way it always has.
  SELECT
    COALESCE(SUM(CASE WHEN elem->>'method' = 'cash' THEN (elem->>'amount')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN elem->>'method' = 'card' THEN (elem->>'amount')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN elem->>'method' NOT IN ('cash','card') THEN (elem->>'amount')::numeric ELSE 0 END), 0)
  INTO v_split_tender_cash, v_split_tender_card, v_split_tender_other
  FROM sales s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.payment_splits, '[]'::jsonb)) elem
  WHERE s.branch_id = v_session.branch_id
    AND s.is_refund = false
    AND s.payment_method <> 'cash'
    AND s.created_at >= v_session.opened_at
    AND s.created_at <= NOW();

  -- Fixed in migration 194: v_cash_sales must also receive its split leg,
  -- exactly like v_card_sales/v_other_sales already do below -- previously
  -- missing, which silently dropped every split-tender sale's cash leg from
  -- the Cash Sales tile (Expected Cash itself was unaffected, since it added
  -- v_split_tender_cash separately -- see the v_expected formula below,
  -- where that separate term is now removed to avoid double-counting).
  v_cash_sales  := v_cash_sales  + v_split_tender_cash;
  v_card_sales  := v_card_sales  + v_split_tender_card;
  v_other_sales := v_other_sales + v_split_tender_other;

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
    COALESCE(SUM(CASE WHEN sp.method = 'card' THEN sp.amount ELSE 0 END), 0),
    COALESCE(SUM(sp.amount), 0)
  INTO v_credit_repayments_cash, v_credit_repayments_card, v_credit_repayments_total
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
  ),
  -- Card portion of a repair refund — mirrors repair_cash_refunded above.
  repair_card_refunded AS (
    SELECT re.repair_id,
           LEAST(
             re.amt,
             COALESCE((SELECT SUM(rp.amount) FROM repair_payments rp
                        WHERE rp.repair_id = re.repair_id AND rp.method = 'card'), 0)
           ) AS card_amt
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
    COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'card'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'card'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'card'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'store_credit'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'store_credit'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'loyalty_points'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'loyalty_points'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method IS NULL OR payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0),
    COALESCE((SELECT SUM(cash_amt) FROM repair_cash_refunded), 0),
    COALESCE((SELECT SUM(card_amt) FROM repair_card_refunded), 0)
  INTO
    v_repair_sales, v_repair_refunds, v_repair_tx_count,
    v_repair_cash_sales, v_repair_cash_deposits, v_repair_card_deposits, v_repair_card_sales, v_repair_store_credit_sales, v_repair_loyalty_points_sales, v_repair_other_sales,
    v_repair_cash_refunds, v_repair_card_refunds;

  -- v_split_tender_cash removed from this formula (migration 194) -- it is
  -- now already included in v_cash_sales above, so adding it again here
  -- would double-count it. Expected Cash's total is unchanged by this.
  v_expected := v_session.opening_float
    + v_cash_sales + v_repair_cash_deposits + v_credit_repayments_cash
    + v_card_sales + v_repair_card_deposits + v_credit_repayments_card
    + v_cash_in - v_cash_out
    - v_cash_refunds - v_repair_cash_refunds
    - v_card_refunds - v_repair_card_refunds;

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
    'split_tender_card',           v_split_tender_card,
    'card_refunds',                v_card_refunds,
    'credit_repayments_cash',      v_credit_repayments_cash,
    'credit_repayments_card',      v_credit_repayments_card,
    'credit_repayments_total',     v_credit_repayments_total,
    'opening_float',               v_session.opening_float,
    'expected_cash',               v_expected,
    'repair_sales',                v_repair_sales,
    'repair_refunds',              v_repair_refunds,
    'repair_cash_refunds',         v_repair_cash_refunds,
    'repair_card_refunds',         v_repair_card_refunds,
    'repair_card_deposits',        v_repair_card_deposits,
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
  p_session_id        UUID,
  p_closing_cash       NUMERIC,
  p_closing_note        TEXT DEFAULT NULL,
  p_closing_card_total   NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_session                 register_sessions%ROWTYPE;
  v_total_sales              NUMERIC := 0;
  v_total_refunds             NUMERIC := 0;
  v_cash_refunds               NUMERIC := 0;
  v_card_refunds                NUMERIC := 0;
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
  v_split_tender_card                     NUMERIC := 0;
  v_split_tender_other                    NUMERIC := 0;
  v_expected                              NUMERIC := 0;
  v_variance                               NUMERIC := 0;
  v_repair_sales                            NUMERIC := 0;
  v_repair_refunds                           NUMERIC := 0;
  v_repair_cash_refunds                      NUMERIC := 0;
  v_repair_card_refunds                      NUMERIC := 0;
  v_repair_tx_count                           INT     := 0;
  v_repair_cash_sales                          NUMERIC := 0;
  v_repair_cash_deposits                        NUMERIC := 0;
  v_repair_card_deposits                        NUMERIC := 0;
  v_repair_card_sales                            NUMERIC := 0;
  v_repair_store_credit_sales                     NUMERIC := 0;
  v_repair_loyalty_points_sales                    NUMERIC := 0;
  v_repair_other_sales                              NUMERIC := 0;
  v_credit_repayments_cash                           NUMERIC := 0;
  v_credit_repayments_card                           NUMERIC := 0;
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
    -- 'split' excluded here too -- its legs are recovered separately below
    -- (v_split_tender_cash/card/other) and folded in after this block, so
    -- counting the full split total here as well would double-count it.
    COALESCE(SUM(CASE WHEN s.payment_method NOT IN ('cash','card','store_credit','loyalty_points','on_account','split') AND s.is_refund = false THEN s.total ELSE 0 END), 0),
    COUNT(*),
    COALESCE(SUM(CASE WHEN s.payment_method = 'cash' AND s.is_refund = true THEN s.total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN s.payment_method = 'card' AND s.is_refund = true THEN s.total ELSE 0 END), 0)
  INTO
    v_total_sales, v_total_refunds,
    v_cash_sales, v_card_sales, v_store_credit_sales, v_loyalty_points_sales, v_on_account_sales, v_other_sales,
    v_tx_count, v_cash_refunds, v_card_refunds
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

  -- Cash/card/other tendered as part of a split-tender sale — see comment in
  -- register_session_expected above; same gap, same fix, kept in sync.
  SELECT
    COALESCE(SUM(CASE WHEN elem->>'method' = 'cash' THEN (elem->>'amount')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN elem->>'method' = 'card' THEN (elem->>'amount')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN elem->>'method' NOT IN ('cash','card') THEN (elem->>'amount')::numeric ELSE 0 END), 0)
  INTO v_split_tender_cash, v_split_tender_card, v_split_tender_other
  FROM sales s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.payment_splits, '[]'::jsonb)) elem
  WHERE s.branch_id = v_session.branch_id
    AND s.is_refund = false
    AND s.payment_method <> 'cash'
    AND s.created_at >= v_session.opened_at
    AND s.created_at <= NOW();

  -- Fixed in migration 194 — see comment in register_session_expected above.
  v_cash_sales  := v_cash_sales  + v_split_tender_cash;
  v_card_sales  := v_card_sales  + v_split_tender_card;
  v_other_sales := v_other_sales + v_split_tender_other;

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
    COALESCE(SUM(CASE WHEN sp.method = 'card' THEN sp.amount ELSE 0 END), 0),
    COALESCE(SUM(sp.amount), 0)
  INTO v_credit_repayments_cash, v_credit_repayments_card, v_credit_repayments_total
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
  ),
  -- Card portion of a repair refund — mirrors repair_cash_refunded above.
  repair_card_refunded AS (
    SELECT re.repair_id,
           LEAST(
             re.amt,
             COALESCE((SELECT SUM(rp.amount) FROM repair_payments rp
                        WHERE rp.repair_id = re.repair_id AND rp.method = 'card'), 0)
           ) AS card_amt
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
    COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'card'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'card'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'card'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'store_credit'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'store_credit'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method = 'loyalty_points'), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method = 'loyalty_points'), 0),
    COALESCE((SELECT SUM(amt) FROM pos_paid WHERE payment_method IS NULL OR payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM repair_payments_in_window WHERE payment_method NOT IN ('cash','card','store_credit','loyalty_points')), 0)
      + COALESCE((SELECT SUM(amt) FROM collected_elsewhere), 0),
    COALESCE((SELECT SUM(cash_amt) FROM repair_cash_refunded), 0),
    COALESCE((SELECT SUM(card_amt) FROM repair_card_refunded), 0)
  INTO
    v_repair_sales, v_repair_refunds, v_repair_tx_count,
    v_repair_cash_sales, v_repair_cash_deposits, v_repair_card_deposits, v_repair_card_sales, v_repair_store_credit_sales, v_repair_loyalty_points_sales, v_repair_other_sales,
    v_repair_cash_refunds, v_repair_card_refunds;

  -- v_split_tender_cash removed from this formula (migration 194) -- it is
  -- now already included in v_cash_sales above, so adding it again here
  -- would double-count it. Expected Cash's total is unchanged by this.
  v_expected := v_session.opening_float
    + v_cash_sales + v_repair_cash_deposits + v_credit_repayments_cash
    + v_card_sales + v_repair_card_deposits + v_credit_repayments_card
    + v_cash_in - v_cash_out
    - v_cash_refunds - v_repair_cash_refunds
    - v_card_refunds - v_repair_card_refunds;
  v_variance := (p_closing_cash + p_closing_card_total) - v_expected;

  UPDATE register_sessions SET
    closing_cash             = p_closing_cash,
    closing_card_total        = p_closing_card_total,
    closing_note               = p_closing_note,
    expected_cash               = v_expected,
    variance                    = v_variance,
    total_sales                  = v_total_sales,
    total_refunds                 = v_total_refunds,
    cash_sales                    = v_cash_sales,
    card_sales                     = v_card_sales,
    other_sales                     = v_other_sales,
    transaction_count                = v_tx_count,
    cash_in_total                     = v_cash_in,
    cash_out_total                     = v_cash_out,
    repair_sales                        = v_repair_sales,
    repair_refunds                       = v_repair_refunds,
    repair_transaction_count              = v_repair_tx_count,
    repair_cash_sales                      = v_repair_cash_sales,
    repair_card_sales                       = v_repair_card_sales,
    repair_other_sales                       = v_repair_other_sales,
    closed_at                                 = NOW(),
    status                                     = 'closed'
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
    'split_tender_card',           v_split_tender_card,
    'card_refunds',                v_card_refunds,
    'credit_repayments_cash',      v_credit_repayments_cash,
    'credit_repayments_card',      v_credit_repayments_card,
    'credit_repayments_total',     v_credit_repayments_total,
    'opening_float',               v_session.opening_float,
    'closing_cash',                p_closing_cash,
    'closing_card_total',          p_closing_card_total,
    'expected_cash',               v_expected,
    'variance',                    v_variance,
    'repair_sales',                v_repair_sales,
    'repair_refunds',              v_repair_refunds,
    'repair_cash_refunds',         v_repair_cash_refunds,
    'repair_card_refunds',         v_repair_card_refunds,
    'repair_card_deposits',        v_repair_card_deposits,
    'repair_transaction_count',    v_repair_tx_count,
    'repair_cash_sales',           v_repair_cash_sales,
    'repair_card_sales',           v_repair_card_sales,
    'repair_store_credit_sales',   v_repair_store_credit_sales,
    'repair_loyalty_points_sales', v_repair_loyalty_points_sales,
    'repair_other_sales',          v_repair_other_sales,
    'grand_total',                 v_total_sales + v_repair_sales - v_repair_refunds - v_total_refunds,
    'opened_at',                   v_session.opened_at,
    'closed_at',                   NOW()
  );
END;
$$;
