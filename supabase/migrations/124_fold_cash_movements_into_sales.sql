-- Migration 124: Fold Cash In/Out directly into Sales revenue, replacing the
-- separate "Other Income" ledger.
--
-- Previously: Cash In could optionally be logged to `other_income` (its own
-- tab, never touching Sales revenue), Cash Out could optionally be logged to
-- `expenses`. Neither ever affected "Sales" anywhere in the app.
--
-- New policy: Cash In always adds to Sales revenue, Cash Out always
-- subtracts from it — everywhere revenue is computed. Since Cash In always
-- counts as revenue now, the separate "Other Income" opt-in/ledger is
-- redundant and removed (app-layer removal; this migration only updates the
-- SQL side). `other_income`/`other_income_categories` tables are left in
-- place (not dropped) so historical data isn't destroyed.

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
