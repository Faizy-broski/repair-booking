-- Migration 201: Split-tender refunds silently dropped their cash leg from
-- every cash figure (POS live stats, Expected Cash, Cash Sales) -- reported
-- by Riseteck: a PS5 sold for 250 (220 cash + 30 card) and a PS5 controller
-- sold for 50 (20 cash + 30 card) were both refunded, and the card portion of
-- each refund showed up correctly everywhere, but the cash portion vanished.
--
-- Root cause: split-tender SALES are fully supported -- sales.payment_method
-- can be 'split' with a payment_splits JSONB array of {method, amount} legs,
-- and register_session_expected()/close_register_session() (migration 198)
-- recover each leg via a jsonb_array_elements query and fold the cash leg
-- into v_cash_sales, the card leg into v_card_sales (that fold-in was itself
-- a prior fix, migration 194, for this exact class of bug -- but only on the
-- sales side).
--
-- Refunds never got the equivalent treatment:
--   - process_refund() (migration 188) inserts payment_method from the
--     caller but never sets payment_splits, so every refund row is stuck at
--     the table default '[]'::jsonb, even when the caller now sends one
--     (see the refundSchema/PosService.processRefund change accompanying
--     this migration, which lets the refund UIs send payment_method:'split'
--     + payment_splits).
--   - register_session_expected()/close_register_session() compute
--     v_cash_refunds/v_card_refunds purely from
--     payment_method IN ('cash','card') AND is_refund = true on the refund
--     row itself -- there was no leg-recovery query mirroring the sales
--     side. So a split-tender refund could only ever be tagged with ONE
--     method by the cashier, and whichever leg wasn't picked never reduced
--     any cash total anywhere.
--
-- Fix, mirroring migrations 188 + 194 exactly:
--   1. process_refund() now stores payment_splits from the caller (same
--      COALESCE(..., '[]'::jsonb) pattern process_sale() already uses),
--      instead of leaving it at the column default.
--   2. register_session_expected() and close_register_session() each gain a
--      refund-side split-leg recovery query -- identical to the existing
--      sales-side one, just filtered to is_refund = true instead of false --
--      and fold the recovered legs into v_cash_refunds/v_card_refunds. Since
--      v_expected/v_variance already reference those two variables directly,
--      this requires NO formula change, exactly like migration 194's fold.
--
-- Unlike migration 194 (where Expected Cash was already correct and only the
-- Cash Sales tile was wrong), Expected Cash itself WAS wrong before this fix
-- for a split-tender refund: the unpicked leg was truly missing from the
-- reconciliation, not just from a display tile. This only affects
-- newly-processed refunds going forward -- Riseteck's two historical
-- refund rows are corrected separately via a one-off data script
-- (scripts/fix-riseteck-split-refund.mjs), which depends on this migration
-- being applied first (a refund's payment_splits only affects the register
-- functions' output once this fix ships).
--
-- Every other field, branch, and formula in these three functions is copied
-- verbatim from their current bodies (188 for process_refund; 198 for the
-- two register functions) -- only the additions described above are new.

CREATE OR REPLACE FUNCTION process_refund(p_refund_data JSONB)
RETURNS UUID AS $$
DECLARE
  v_refund_id       UUID;
  v_item            JSONB;
  v_original_id     UUID;
  v_orig_qty        INT;
  v_refunded_qty    INT;
  v_all_refunded    BOOLEAN;
  v_item_cost       NUMERIC;
  v_discount_alloc  UUID;
  v_alloc_product   UUID;
  v_alloc_variant   UUID;
  v_alloc_branch    UUID;
  v_can_reactivate  BOOLEAN;
  v_invoice_number  TEXT;
BEGIN
  v_original_id := NULLIF(p_refund_data->>'original_sale_id', '')::UUID;

  IF v_original_id IS NOT NULL THEN
    PERFORM 1 FROM sales WHERE id = v_original_id FOR UPDATE;
  END IF;

  IF v_original_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_refund_data->'items')
    LOOP
      SELECT COALESCE(SUM(si.quantity), 0) INTO v_orig_qty
      FROM sale_items si WHERE si.sale_id = v_original_id AND si.name = v_item->>'name';

      SELECT COALESCE(SUM(si.quantity), 0) INTO v_refunded_qty
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.original_sale_id = v_original_id AND s.is_refund = true AND si.name = v_item->>'name';

      IF (v_item->>'quantity')::INT > (v_orig_qty - v_refunded_qty) THEN
        RAISE EXCEPTION 'Cannot refund more than remaining quantity for: %', v_item->>'name';
      END IF;
    END LOOP;
  END IF;

  v_invoice_number := generate_invoice_number((p_refund_data->>'branch_id')::UUID);

  INSERT INTO sales (
    branch_id, customer_id, cashier_id,
    subtotal, discount, tax, total,
    payment_method, payment_splits, payment_status,
    is_refund, refund_reason, original_sale_id,
    notes, invoice_number
  )
  VALUES (
    (p_refund_data->>'branch_id')::UUID,
    NULLIF(p_refund_data->>'customer_id', '')::UUID,
    NULLIF(p_refund_data->>'cashier_id', '')::UUID,
    ABS((p_refund_data->>'subtotal')::NUMERIC),
    0,
    ABS((p_refund_data->>'tax')::NUMERIC),
    ABS((p_refund_data->>'total')::NUMERIC),
    COALESCE(p_refund_data->>'payment_method', 'cash'),
    COALESCE(p_refund_data->'payment_splits', '[]'::jsonb),
    'refunded',
    true,
    p_refund_data->>'refund_reason',
    v_original_id,
    'Refund for sale ' || COALESCE(p_refund_data->>'original_sale_id', ''),
    v_invoice_number
  )
  RETURNING id INTO v_refund_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_refund_data->'items')
  LOOP
    v_item_cost      := NULL;
    v_discount_alloc := NULL;
    IF v_original_id IS NOT NULL THEN
      SELECT si.unit_cost, si.discount_allocation_id INTO v_item_cost, v_discount_alloc
      FROM sale_items si
      WHERE si.sale_id = v_original_id AND si.name = v_item->>'name'
      LIMIT 1;
    END IF;

    INSERT INTO sale_items (
      sale_id, product_id, variant_id, name, quantity, unit_price, discount, total, unit_cost, discount_allocation_id
    )
    VALUES (
      v_refund_id,
      NULLIF(v_item->>'product_id', '')::UUID,
      NULLIF(v_item->>'variant_id', '')::UUID,
      v_item->>'name',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      0,
      ABS((v_item->>'total')::NUMERIC),
      v_item_cost,
      v_discount_alloc
    );

    IF (v_item->>'is_service')::BOOLEAN IS NOT TRUE THEN
      UPDATE inventory
      SET quantity = quantity + (v_item->>'quantity')::INT, updated_at = NOW()
      WHERE branch_id = (p_refund_data->>'branch_id')::UUID
        AND product_id = NULLIF(v_item->>'product_id', '')::UUID
        AND (
          variant_id = NULLIF(v_item->>'variant_id', '')::UUID
          OR (variant_id IS NULL AND NULLIF(v_item->>'variant_id', '') IS NULL)
        );

      PERFORM restore_cost_layer(
        NULLIF(v_item->>'product_id', '')::UUID,
        (p_refund_data->>'branch_id')::UUID,
        (v_item->>'quantity')::INT,
        v_item_cost,
        NULLIF(v_item->>'variant_id', '')::UUID
      );

      IF v_discount_alloc IS NOT NULL THEN
        SELECT product_id, variant_id, branch_id INTO v_alloc_product, v_alloc_variant, v_alloc_branch
        FROM product_discount_allocations WHERE id = v_discount_alloc FOR UPDATE;

        SELECT NOT EXISTS (
          SELECT 1 FROM product_discount_allocations
          WHERE id <> v_discount_alloc AND status = 'active'
            AND product_id = v_alloc_product AND branch_id = v_alloc_branch
            AND variant_id IS NOT DISTINCT FROM v_alloc_variant
        ) INTO v_can_reactivate;

        UPDATE product_discount_allocations
        SET quantity_remaining = quantity_remaining + (v_item->>'quantity')::INT,
            status   = CASE WHEN v_can_reactivate THEN 'active' ELSE status END,
            ended_at = CASE WHEN v_can_reactivate THEN NULL ELSE ended_at END
        WHERE id = v_discount_alloc;
      END IF;

      INSERT INTO stock_movements (branch_id, product_id, variant_id, type, quantity, reference_id, note)
      VALUES (
        (p_refund_data->>'branch_id')::UUID,
        NULLIF(v_item->>'product_id', '')::UUID,
        NULLIF(v_item->>'variant_id', '')::UUID,
        'return', (v_item->>'quantity')::INT, v_refund_id, 'POS Refund'
      );
    END IF;
  END LOOP;

  IF v_original_id IS NOT NULL THEN
    SELECT bool_and(
      (
        SELECT COALESCE(SUM(ri.quantity), 0)
        FROM sale_items ri
        JOIN sales rs ON rs.id = ri.sale_id
        WHERE rs.original_sale_id = v_original_id AND rs.is_refund = true AND ri.name = osi.name
      ) >= osi.quantity
    ) INTO v_all_refunded
    FROM sale_items osi WHERE osi.sale_id = v_original_id;

    UPDATE sales
    SET payment_status = CASE WHEN v_all_refunded THEN 'refunded' ELSE 'partial' END
    WHERE id = v_original_id;
  END IF;

  RETURN v_refund_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  v_other_sales_breakdown      JSONB   := '{}'::jsonb;
  v_tx_count                   INT     := 0;
  v_cash_in                    NUMERIC := 0;
  v_cash_out                   NUMERIC := 0;
  v_buyback_out                NUMERIC := 0;
  v_split_tender_cash          NUMERIC := 0;
  v_split_tender_card          NUMERIC := 0;
  v_split_tender_other         NUMERIC := 0;
  -- New: refund-side split-tender legs (migration 201) -- mirrors
  -- v_split_tender_cash/card above, but recovered from is_refund = true
  -- rows instead of false.
  v_split_tender_cash_refund   NUMERIC := 0;
  v_split_tender_card_refund   NUMERIC := 0;
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
    -- Already naturally excludes 'split' refund rows (payment_method equals
    -- neither 'cash' nor 'card' for those) -- their legs are recovered
    -- separately below (v_split_tender_cash_refund/card_refund) and folded
    -- in, mirroring the sales-side v_split_tender_cash/card handling above.
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

  v_cash_sales  := v_cash_sales  + v_split_tender_cash;
  v_card_sales  := v_card_sales  + v_split_tender_card;
  v_other_sales := v_other_sales + v_split_tender_other;

  -- New (migration 201): recover a split-tender REFUND's legs the same way,
  -- so a refund that mirrors a split-tender sale's cash+card breakdown
  -- correctly reduces both v_cash_refunds and v_card_refunds instead of only
  -- whichever single payment_method the refund row happened to carry.
  SELECT
    COALESCE(SUM(CASE WHEN elem->>'method' = 'cash' THEN (elem->>'amount')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN elem->>'method' = 'card' THEN (elem->>'amount')::numeric ELSE 0 END), 0)
  INTO v_split_tender_cash_refund, v_split_tender_card_refund
  FROM sales s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.payment_splits, '[]'::jsonb)) elem
  WHERE s.branch_id = v_session.branch_id
    AND s.is_refund = true
    AND s.payment_method <> 'cash'
    AND s.created_at >= v_session.opened_at
    AND s.created_at <= NOW();

  v_cash_refunds := v_cash_refunds + v_split_tender_cash_refund;
  v_card_refunds := v_card_refunds + v_split_tender_card_refund;

  -- New: break v_other_sales down by individual method (e.g. Riseteck's
  -- eBay/Deliveroo/Website channels) -- same two sources as v_other_sales
  -- itself (direct non-split sales + non-cash/non-card split legs), just
  -- grouped instead of collapsed. Sum of this object's values always
  -- equals v_other_sales exactly.
  SELECT COALESCE(jsonb_object_agg(method, amt), '{}'::jsonb)
  INTO v_other_sales_breakdown
  FROM (
    SELECT method, SUM(amt) AS amt
    FROM (
      SELECT s.payment_method AS method, s.total - COALESCE(rp.repair_amt, 0) AS amt
      FROM sales s
      LEFT JOIN (
        SELECT sale_id, SUM(total) AS repair_amt
        FROM sale_items
        WHERE repair_id IS NOT NULL
        GROUP BY sale_id
      ) rp ON rp.sale_id = s.id
      WHERE s.branch_id = v_session.branch_id
        AND s.is_refund = false
        AND s.payment_method NOT IN ('cash','card','store_credit','loyalty_points','on_account','split')
        AND s.created_at >= v_session.opened_at
        AND s.created_at <= NOW()

      UNION ALL

      SELECT elem->>'method' AS method, (elem->>'amount')::numeric AS amt
      FROM sales s
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.payment_splits, '[]'::jsonb)) elem
      WHERE s.branch_id = v_session.branch_id
        AND s.is_refund = false
        AND s.payment_method <> 'cash'
        AND elem->>'method' NOT IN ('cash','card')
        AND s.created_at >= v_session.opened_at
        AND s.created_at <= NOW()
    ) raw
    GROUP BY method
  ) grouped;

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
    'other_sales_breakdown',       v_other_sales_breakdown,
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
    'repair_cash_deposits',        v_repair_cash_deposits,
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
  v_other_sales_breakdown             JSONB   := '{}'::jsonb;
  v_tx_count                          INT     := 0;
  v_cash_in                            NUMERIC := 0;
  v_cash_out                            NUMERIC := 0;
  v_buyback_out                          NUMERIC := 0;
  v_split_tender_cash                     NUMERIC := 0;
  v_split_tender_card                     NUMERIC := 0;
  v_split_tender_other                    NUMERIC := 0;
  -- New: refund-side split-tender legs (migration 201) -- see comment in
  -- register_session_expected above; same gap, same fix, kept in sync.
  v_split_tender_cash_refund               NUMERIC := 0;
  v_split_tender_card_refund               NUMERIC := 0;
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
    -- Already naturally excludes 'split' refund rows -- see comment in
    -- register_session_expected above.
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

  v_cash_sales  := v_cash_sales  + v_split_tender_cash;
  v_card_sales  := v_card_sales  + v_split_tender_card;
  v_other_sales := v_other_sales + v_split_tender_other;

  -- New (migration 201): refund-side split-tender legs — see comment in
  -- register_session_expected above; same gap, same fix, kept in sync.
  SELECT
    COALESCE(SUM(CASE WHEN elem->>'method' = 'cash' THEN (elem->>'amount')::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN elem->>'method' = 'card' THEN (elem->>'amount')::numeric ELSE 0 END), 0)
  INTO v_split_tender_cash_refund, v_split_tender_card_refund
  FROM sales s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.payment_splits, '[]'::jsonb)) elem
  WHERE s.branch_id = v_session.branch_id
    AND s.is_refund = true
    AND s.payment_method <> 'cash'
    AND s.created_at >= v_session.opened_at
    AND s.created_at <= NOW();

  v_cash_refunds := v_cash_refunds + v_split_tender_cash_refund;
  v_card_refunds := v_card_refunds + v_split_tender_card_refund;

  -- New: break v_other_sales down by individual method — see comment in
  -- register_session_expected above; same gap, same fix, kept in sync.
  SELECT COALESCE(jsonb_object_agg(method, amt), '{}'::jsonb)
  INTO v_other_sales_breakdown
  FROM (
    SELECT method, SUM(amt) AS amt
    FROM (
      SELECT s.payment_method AS method, s.total - COALESCE(rp.repair_amt, 0) AS amt
      FROM sales s
      LEFT JOIN (
        SELECT sale_id, SUM(total) AS repair_amt
        FROM sale_items
        WHERE repair_id IS NOT NULL
        GROUP BY sale_id
      ) rp ON rp.sale_id = s.id
      WHERE s.branch_id = v_session.branch_id
        AND s.is_refund = false
        AND s.payment_method NOT IN ('cash','card','store_credit','loyalty_points','on_account','split')
        AND s.created_at >= v_session.opened_at
        AND s.created_at <= NOW()

      UNION ALL

      SELECT elem->>'method' AS method, (elem->>'amount')::numeric AS amt
      FROM sales s
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.payment_splits, '[]'::jsonb)) elem
      WHERE s.branch_id = v_session.branch_id
        AND s.is_refund = false
        AND s.payment_method <> 'cash'
        AND elem->>'method' NOT IN ('cash','card')
        AND s.created_at >= v_session.opened_at
        AND s.created_at <= NOW()
    ) raw
    GROUP BY method
  ) grouped;

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
    other_sales_breakdown            = v_other_sales_breakdown,
    transaction_count                = v_tx_count,
    cash_in_total                     = v_cash_in,
    cash_out_total                     = v_cash_out,
    repair_sales                        = v_repair_sales,
    repair_refunds                       = v_repair_refunds,
    repair_transaction_count              = v_repair_tx_count,
    repair_cash_sales                      = v_repair_cash_sales,
    repair_card_sales                       = v_repair_card_sales,
    repair_other_sales                       = v_repair_other_sales,
    repair_cash_deposits                       = v_repair_cash_deposits,
    repair_card_deposits                        = v_repair_card_deposits,
    closed_at                                     = NOW(),
    status                                         = 'closed'
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
    'other_sales_breakdown',       v_other_sales_breakdown,
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
    'repair_cash_deposits',        v_repair_cash_deposits,
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
