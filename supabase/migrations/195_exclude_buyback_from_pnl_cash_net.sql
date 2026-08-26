-- Migration 195: Two P&L fixes.
--
-- FIX 1 (the one being reported): buyback cash-outs were being counted as a
-- loss TWICE — once immediately on the day of the buyback, and again as
-- COGS on the day the item is resold. record_cash_movement()'s buyback
-- branch (migration 133/161) creates a `products` row with cost_price =
-- the buyback amount and adds 1 unit to inventory — the buyback cash
-- converts into inventory, same as any normal stock purchase. When that
-- item is later sold, consume_and_freeze_cost() (migration 136) freezes
-- sale_items.unit_cost from that cost_price (no cost layer exists yet for
-- a buyback product, so it falls back to cost_price), and this function's
-- COGS sum picks that up — correctly reducing profit at the time of
-- resale. But v_cash_net (migration 171) ALSO subtracted the full buyback
-- amount immediately, on the incorrect assumption it "has no other P&L
-- mirror". It does — the COGS mirror above. Fix: exclude purpose='buyback'
-- from v_cash_net too, mirroring the existing 'expense'/'plain'
-- exclusions. This moves the cost from "immediate loss on the day of
-- buyback" to "COGS on the day of resale", matching every other inventory
-- acquisition path in this system (a normal supplier purchase never gets
-- an immediate P&L hit either, only COGS at resale).
--
-- FIX 2 (found while investigating fix 1, more serious): migration 187
-- (gift_card_sale exclusion) was accidentally written from an OUTDATED
-- copy of this function — the one from migration 171 — instead of the
-- actual latest version at the time, migration 183. Applying 187 to a
-- database that already had 178/180/183 applied would have SILENTLY
-- REVERTED all three:
--   - 178's third-party repair lab fee cost (v_repair_lab_fees) — dropped
--     entirely, so lab fees were never subtracted from profit.
--   - 180's repair discount_amount fallback in repair revenue — dropped,
--     so a discounted repair's revenue (and the v_repairs_booked reference
--     figure) was overstated by the discount amount.
--   - 183's completed_at-based date gating for repair revenue/parts
--     COGS/lab fees (dropped back to updated_at, which bumps on ANY edit,
--     not just completion — could pull a repair's revenue into the wrong
--     reporting period).
--   - 183's repair_custom_statuses/is_terminal lookup — dropped back to a
--     hardcoded status-string list, which silently miscounts repair
--     revenue for any business using custom status names that don't match
--     that hardcoded list.
--   - The FIFO-aware `COALESCE(NULLIF(si.unit_cost,0), p.cost_price, 0)`
--     sales COGS calculation — dropped back to a plain `p.cost_price`
--     join, ignoring frozen per-sale unit costs entirely.
--   - The 'plain'-purpose cash-out exclusion from v_cash_net — dropped, so
--     "Plain" cash-outs (which the Cash In/Out UI explicitly promises
--     "will not be reflected in your reports") HAVE been reducing reported
--     profit ever since 187 was applied. This is very likely a second,
--     separate source of the same kind of unexplained "loss" being
--     investigated here.
--
-- This migration restores the full, correct body from migration 183 (every
-- field, join, and date-gating condition unchanged), re-applies 187's
-- gift_card_sale exclusion and the 'gift_card_sale' purpose CHECK
-- constraint value (already added by 187 — not repeated here, ALTER TABLE
-- is idempotent-safe but unnecessary since 187 already ran), and adds the
-- new 'buyback' exclusion from Fix 1 above. No other logic changes.

CREATE OR REPLACE FUNCTION get_profit_loss(
  p_branch_id  UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_business_id        UUID;
  v_revenue            NUMERIC := 0;
  v_repairs            NUMERIC := 0;
  v_repairs_pos         NUMERIC := 0;
  v_repairs_direct      NUMERIC := 0;
  v_repairs_booked     NUMERIC := 0;
  v_cogs               NUMERIC := 0;
  v_repair_cogs        NUMERIC := 0;
  v_sales_cogs         NUMERIC := 0;
  v_repair_parts_cogs  NUMERIC := 0;
  v_repair_lab_fees    NUMERIC := 0;
  v_expenses           NUMERIC := 0;
  v_salaries           NUMERIC := 0;
  v_cash_net           NUMERIC := 0;
BEGIN
  SELECT business_id INTO v_business_id FROM branches WHERE id = p_branch_id;

  SELECT COALESCE(SUM(total),0)
  INTO v_revenue
  FROM sales
  WHERE branch_id = p_branch_id
    AND payment_status != 'refunded'
    AND created_at::date BETWEEN p_start_date AND p_end_date;

  -- Repair revenue: POS-charged amount overrides deposit_paid/actual_cost
  -- when a repair was paid through the till. Computed here alongside its
  -- two components (v_repairs_pos / v_repairs_direct) in one pass — their
  -- sum is v_repairs, unchanged from before. Gated on completed_at
  -- (migration 182) instead of updated_at, since updated_at bumps on any
  -- edit and isn't a stable "when did this job actually finish" signal.
  SELECT
    COALESCE(SUM(COALESCE(pos_override.pos_net_total, COALESCE(r.actual_cost, GREATEST(0, COALESCE(r.estimated_cost, 0) - COALESCE(r.discount_amount, 0))))), 0),
    COALESCE(SUM(CASE WHEN pos_override.pos_net_total IS NOT NULL THEN pos_override.pos_net_total ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN pos_override.pos_net_total IS NULL THEN COALESCE(r.actual_cost, GREATEST(0, COALESCE(r.estimated_cost, 0) - COALESCE(r.discount_amount, 0))) ELSE 0 END), 0)
  INTO v_repairs, v_repairs_pos, v_repairs_direct
  FROM repairs r
  LEFT JOIN (
    SELECT si.repair_id,
           SUM(CASE WHEN s.is_refund THEN -si.total ELSE si.total END) AS pos_net_total
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE si.repair_id IS NOT NULL
    GROUP BY si.repair_id
  ) pos_override ON pos_override.repair_id = r.id
  WHERE r.branch_id = p_branch_id
    AND EXISTS (
      SELECT 1 FROM repair_custom_statuses rcs
      WHERE rcs.business_id = v_business_id
        AND rcs.is_terminal
        AND LOWER(TRIM(rcs.name)) = LOWER(TRIM(r.status))
    )
    AND r.completed_at::date BETWEEN p_start_date AND p_end_date;

  -- Reference-only figure: booking-window repair revenue, matching the
  -- Repairs module dashboard's own "Revenue" card (repairs *created* in the
  -- date range, every status, deposit_paid used for still-open jobs). Not
  -- part of any total/gross/net profit math below. Still keyed off
  -- created_at, not completion date.
  SELECT COALESCE(SUM(
    CASE
      WHEN pos_override.pos_net_total IS NOT NULL THEN pos_override.pos_net_total
      WHEN LOWER(r.status) = 'refunded' THEN GREATEST(0, COALESCE(r.deposit_paid,0) - COALESCE(r.refund_amount,0))
      WHEN EXISTS (
        SELECT 1 FROM repair_custom_statuses rcs
        WHERE rcs.business_id = v_business_id
          AND rcs.is_terminal
          AND LOWER(TRIM(rcs.name)) = LOWER(TRIM(r.status))
      ) THEN COALESCE(r.actual_cost, GREATEST(0, COALESCE(r.estimated_cost, 0) - COALESCE(r.discount_amount, 0)))
      ELSE COALESCE(r.deposit_paid, 0)
    END
  ), 0)
  INTO v_repairs_booked
  FROM repairs r
  LEFT JOIN (
    SELECT si.repair_id,
           SUM(CASE WHEN s.is_refund THEN -si.total ELSE si.total END) AS pos_net_total
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE si.repair_id IS NOT NULL
      AND s.created_at::date BETWEEN p_start_date AND p_end_date
    GROUP BY si.repair_id
  ) pos_override ON pos_override.repair_id = r.id
  WHERE r.branch_id = p_branch_id
    AND r.created_at::date BETWEEN p_start_date AND p_end_date;

  -- COGS: frozen sale_items.unit_cost when present (post-migration sales);
  -- falls back to the live products.cost_price join only for historical
  -- sales that predate this migration (unit_cost still the column default
  -- of 0) — those keep reporting exactly what they always have.
  SELECT COALESCE(SUM(si.quantity * COALESCE(NULLIF(si.unit_cost, 0), p.cost_price, 0)), 0)
  INTO v_cogs
  FROM sale_items si
  JOIN sales s           ON s.id = si.sale_id
  JOIN products p        ON p.id = si.product_id
  WHERE s.branch_id = p_branch_id
    AND s.payment_status != 'refunded'
    AND s.created_at::date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(ri.quantity * COALESCE(ri.unit_cost, 0)), 0)
  INTO v_repair_cogs
  FROM repair_items ri
  JOIN repairs r ON r.id = ri.repair_id
  WHERE r.branch_id = p_branch_id
    AND EXISTS (
      SELECT 1 FROM repair_custom_statuses rcs
      WHERE rcs.business_id = v_business_id
        AND rcs.is_terminal
        AND LOWER(TRIM(rcs.name)) = LOWER(TRIM(r.status))
    )
    AND r.completed_at::date BETWEEN p_start_date AND p_end_date;

  -- Third-party lab fee: same gating as repair parts COGS above (terminal
  -- status, completed in this window) — a pass-through cost paid to an
  -- outside lab, never billed to the customer, so it reduces profit exactly
  -- like parts COGS does.
  SELECT COALESCE(SUM(r.lab_fee), 0)
  INTO v_repair_lab_fees
  FROM repairs r
  WHERE r.branch_id = p_branch_id
    AND EXISTS (
      SELECT 1 FROM repair_custom_statuses rcs
      WHERE rcs.business_id = v_business_id
        AND rcs.is_terminal
        AND LOWER(TRIM(rcs.name)) = LOWER(TRIM(r.status))
    )
    AND r.completed_at::date BETWEEN p_start_date AND p_end_date;

  -- Keep the components' pre-combined values for the breakdown fields below;
  -- v_cogs itself becomes the same combined total, now including lab fees.
  v_sales_cogs        := v_cogs;
  v_repair_parts_cogs := v_repair_cogs;
  v_cogs := v_cogs + v_repair_cogs + v_repair_lab_fees;

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

  -- Cash In adds to Sales revenue, Cash Out subtracts — except cash-outs
  -- tagged purpose = 'expense' (already counted via v_expenses above) or
  -- 'plain' (UI explicitly promises these have no report effect) or
  -- 'buyback' (its cost is recognized as COGS at resale instead — see
  -- Fix 1 above), and cash-ins tagged purpose = 'gift_card_sale' (deferred
  -- revenue, not revenue — migration 187).
  SELECT COALESCE(SUM(CASE
      WHEN type = 'cash_in' AND purpose = 'gift_card_sale' THEN 0
      WHEN type = 'cash_in' THEN amount
      WHEN type = 'cash_out' AND purpose = 'expense' THEN 0
      WHEN type = 'cash_out' AND purpose = 'plain'   THEN 0
      WHEN type = 'cash_out' AND purpose = 'buyback' THEN 0
      ELSE -amount
    END), 0)
  INTO v_cash_net
  FROM cash_movements
  WHERE branch_id = p_branch_id
    AND created_at::date BETWEEN p_start_date AND p_end_date;

  RETURN jsonb_build_object(
    'revenue',        v_revenue,
    'repair_revenue', v_repairs,
    'repair_revenue_pos',    v_repairs_pos,
    'repair_revenue_direct', v_repairs_direct,
    'repair_revenue_booked', v_repairs_booked,
    'other_income',   v_cash_net,
    'total_revenue',  v_revenue + v_repairs + v_cash_net,
    'cogs',           v_cogs,
    'sales_cogs',        v_sales_cogs,
    'repair_parts_cogs', v_repair_parts_cogs,
    'repair_lab_fees',   v_repair_lab_fees,
    'expenses',       v_expenses,
    'salaries',       v_salaries,
    'total_costs',    v_cogs + v_expenses + v_salaries,
    'gross_profit',   (v_revenue + v_repairs) - v_cogs,
    'net_profit',     (v_revenue + v_repairs + v_cash_net) - v_cogs - v_expenses - v_salaries
  );
END;
$$;
