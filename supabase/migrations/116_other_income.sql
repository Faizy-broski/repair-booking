-- Migration 116: Other Income
-- Mirrors the `expenses` table exactly, so a POS "Cash In" can optionally be
-- recorded as real income the same way "Cash Out" can optionally be recorded
-- as a real expense. Purely additive: two new tables + a CREATE OR REPLACE
-- on get_profit_loss that only adds a new key/term, never removes or
-- renames an existing one.

CREATE TABLE IF NOT EXISTS other_income_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS other_income (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES other_income_categories(id),
  title        TEXT NOT NULL,
  amount       NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  income_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  notes        TEXT,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS: mirrors the expenses policy shape verbatim ────────────────────────────
ALTER TABLE other_income ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_sees_all_other_income" ON other_income;
CREATE POLICY "owner_sees_all_other_income" ON other_income
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

DROP POLICY IF EXISTS "staff_sees_own_other_income" ON other_income;
CREATE POLICY "staff_sees_own_other_income" ON other_income
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

ALTER TABLE other_income_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_members_see_other_income_categories" ON other_income_categories;
CREATE POLICY "business_members_see_other_income_categories" ON other_income_categories
  FOR ALL TO authenticated
  USING (business_id = public.user_business_id());

-- ── get_profit_loss: add other_income, fix dead repair-revenue calc ───────────
-- Every existing JSON key keeps its name/meaning; only total_revenue/net_profit
-- gain an added term, plus one new key `other_income`. The repair-revenue fix
-- (COALESCE(actual_cost, estimated_cost), broader terminal-status match) can
-- only make that figure more accurate — it always evaluated to 0 before.
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
  v_other_income NUMERIC := 0;
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

  SELECT COALESCE(SUM(amount),0)
  INTO v_other_income
  FROM other_income
  WHERE branch_id = p_branch_id
    AND income_date BETWEEN p_start_date AND p_end_date;

  RETURN jsonb_build_object(
    'revenue',        v_revenue,
    'repair_revenue', v_repairs,
    'other_income',   v_other_income,
    'total_revenue',  v_revenue + v_repairs + v_other_income,
    'cogs',           v_cogs,
    'expenses',       v_expenses,
    'salaries',       v_salaries,
    'total_costs',    v_cogs + v_expenses + v_salaries,
    'gross_profit',   (v_revenue + v_repairs) - v_cogs,
    'net_profit',     (v_revenue + v_repairs + v_other_income) - v_cogs - v_expenses - v_salaries
  );
END;
$$;
