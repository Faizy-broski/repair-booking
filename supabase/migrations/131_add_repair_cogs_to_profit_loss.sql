-- Migration 131: Include repair part costs in Profit & Loss COGS.
--
-- get_profit_loss() computed COGS only from retail sale_items/products,
-- never from repair_items — so any period with repair revenue but no
-- retail sales showed COGS as £0.00 even though repairs consume parts
-- with real costs. This adds a repair-parts COGS query (same repair_items
-- -> repairs join already used by getPartConsumptionReport) filtered by
-- the same status/date criteria as the existing repair revenue query, and
-- folds it into v_cogs so total_costs/gross_profit/net_profit are correct.

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

  -- Cash In adds to Sales revenue, Cash Out subtracts — replaces the old
  -- other_income read. Reuses the `other_income` JSON key so existing
  -- frontend consumers of get_profit_loss don't need to change shape.
  SELECT COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount ELSE -amount END), 0)
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
