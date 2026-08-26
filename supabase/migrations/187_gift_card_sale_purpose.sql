-- Migration 187: Exclude gift-card cash sales from P&L revenue.
--
-- Migration 185's "Expected Cash" fix (GiftCardService.create()) records a
-- gift card sold for cash as a plain cash_in cash_movements row so the
-- register drawer sees the cash. But two separate P&L calculations —
-- computeCashNet() (src/backend/services/dashboard-stats.service.ts, the
-- Dashboard KPI cards) and get_profit_loss() (this function, migration 134,
-- powering the Reports > P&L page) — both already treat EVERY cash_in
-- movement as Sales Revenue by design (the Cash In/Out modal's own copy says
-- "Cash In always counts directly as Sales revenue"). A gift card sale is a
-- liability (deferred revenue) until redeemed, not revenue — the same reason
-- store_credit/loyalty_points sales are excluded from v_cash_sales in the
-- register formula — so folding it into generic cash_in would overstate
-- Sales Revenue / Net Profit on both the Dashboard and the P&L report by the
-- card's face value.
--
-- Fix: give gift-card cash sales their own purpose ('gift_card_sale') and
-- exclude it from get_profit_loss()'s v_cash_net, mirroring the existing
-- purpose = 'expense' exclusion already used on the cash_out side (migration
-- 134). The matching TypeScript-side exclusion is in computeCashNet()
-- (dashboard-stats.service.ts), updated alongside this migration.

ALTER TABLE cash_movements DROP CONSTRAINT IF EXISTS cash_movements_purpose_check;
ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_purpose_check
  CHECK (purpose IN ('plain', 'expense', 'buyback', 'trade_in', 'gift_card_sale'));

CREATE OR REPLACE FUNCTION get_profit_loss(
  p_branch_id  UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_revenue      NUMERIC := 0;
  v_repairs      NUMERIC := 0;
  v_cogs         NUMERIC := 0;
  v_repair_cogs  NUMERIC := 0;
  v_expenses     NUMERIC := 0;
  v_salaries     NUMERIC := 0;
  v_cash_net     NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(total),0)
  INTO v_revenue
  FROM sales
  WHERE branch_id = p_branch_id
    AND payment_status != 'refunded'
    AND created_at::date BETWEEN p_start_date AND p_end_date;

  SELECT COALESCE(SUM(COALESCE(actual_cost, estimated_cost, 0)),0)
  INTO v_repairs
  FROM repairs
  WHERE branch_id = p_branch_id
    AND (
      LOWER(status) IN ('repaired','collected','unrepairable','completed','done','fixed','closed','picked_up','handover')
      OR LOWER(status) LIKE '%complet%' OR LOWER(status) LIKE '%pick%' OR LOWER(status) LIKE '%collect%'
    )
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

  -- Repair COGS: sum(repair_items.quantity * repair_items.unit_cost) for the
  -- same set of completed repairs counted in v_repairs above.
  SELECT COALESCE(SUM(ri.quantity * COALESCE(ri.unit_cost, 0)), 0)
  INTO v_repair_cogs
  FROM repair_items ri
  JOIN repairs r ON r.id = ri.repair_id
  WHERE r.branch_id = p_branch_id
    AND (
      LOWER(r.status) IN ('repaired','collected','unrepairable','completed','done','fixed','closed','picked_up','handover')
      OR LOWER(r.status) LIKE '%complet%' OR LOWER(r.status) LIKE '%pick%' OR LOWER(r.status) LIKE '%collect%'
    )
    AND r.updated_at::date BETWEEN p_start_date AND p_end_date;

  v_cogs := v_cogs + v_repair_cogs;

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
  -- tagged purpose = 'expense' (already counted via v_expenses above) and
  -- cash-ins tagged purpose = 'gift_card_sale' (deferred revenue, not
  -- revenue — see header comment).
  SELECT COALESCE(SUM(CASE
    WHEN type = 'cash_in' AND purpose = 'gift_card_sale' THEN 0
    WHEN type = 'cash_in' THEN amount
    WHEN type = 'cash_out' AND purpose = 'expense' THEN 0
    ELSE -amount
  END), 0)
  INTO v_cash_net
  FROM cash_movements
  WHERE branch_id = p_branch_id
    AND created_at::date BETWEEN p_start_date AND p_end_date;

  RETURN jsonb_build_object(
    'revenue',        v_revenue,
    'repair_revenue', v_repairs,
    'other_income',   v_cash_net,
    'total_revenue',  v_revenue + v_repairs + v_cash_net,
    'cogs',           v_cogs,
    'expenses',       v_expenses,
    'salaries',       v_salaries,
    'total_costs',    v_cogs + v_expenses + v_salaries,
    'gross_profit',   (v_revenue + v_repairs) - v_cogs,
    'net_profit',     (v_revenue + v_repairs + v_cash_net) - v_cogs - v_expenses - v_salaries
  );
END;
$$;
