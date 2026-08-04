-- Purely additive: adds new keys to get_profit_loss's jsonb result so the
-- P&L report can show a fully granular breakdown:
--   'repair_revenue_booked' — side-by-side reference figure matching the
--     Repairs module dashboard's own definition (booking-window: repairs
--     *created* in the date range, all statuses, deposit_paid counted for
--     still-open jobs) next to the existing 'repair_revenue' (completed-only,
--     by completion date).
--   'sales_cogs' / 'repair_parts_cogs' — the two components that were
--     already being silently summed into 'cogs'. 'cogs' itself is unchanged
--     (still their sum) so nothing that already reads it is affected.
--
-- Every existing key/value this function already returns is UNCHANGED —
-- this only adds new fields for cross-reference/breakdown; no totals math
-- (total_revenue, total_costs, gross_profit, net_profit) is altered.

CREATE OR REPLACE FUNCTION get_profit_loss(
  p_branch_id  UUID,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_revenue        NUMERIC := 0;
  v_repairs        NUMERIC := 0;
  v_repairs_booked NUMERIC := 0;
  v_cogs           NUMERIC := 0;
  v_repair_cogs    NUMERIC := 0;
  v_sales_cogs        NUMERIC := 0;
  v_repair_parts_cogs NUMERIC := 0;
  v_expenses       NUMERIC := 0;
  v_salaries       NUMERIC := 0;
  v_cash_net       NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(total),0)
  INTO v_revenue
  FROM sales
  WHERE branch_id = p_branch_id
    AND payment_status != 'refunded'
    AND created_at::date BETWEEN p_start_date AND p_end_date;

  -- Repair revenue: POS-charged amount overrides deposit_paid/actual_cost
  -- when a repair was paid through the till (see header comment above).
  SELECT COALESCE(SUM(
    COALESCE(pos_override.pos_net_total, COALESCE(r.actual_cost, r.estimated_cost, 0))
  ), 0)
  INTO v_repairs
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
    AND (
      LOWER(r.status) IN ('repaired','collected','unrepairable','completed','done','fixed','closed','picked_up','handover')
      OR LOWER(r.status) LIKE '%complet%' OR LOWER(r.status) LIKE '%pick%' OR LOWER(r.status) LIKE '%collect%'
    )
    AND r.updated_at::date BETWEEN p_start_date AND p_end_date;

  -- Reference-only figure: booking-window repair revenue, matching the
  -- Repairs module dashboard's own "Revenue" card (repairs *created* in the
  -- date range, every status, deposit_paid used for still-open jobs). Not
  -- part of any total/gross/net profit math below.
  SELECT COALESCE(SUM(
    CASE
      WHEN pos_override.pos_net_total IS NOT NULL THEN pos_override.pos_net_total
      WHEN LOWER(r.status) = 'refunded' THEN GREATEST(0, COALESCE(r.deposit_paid,0) - COALESCE(r.refund_amount,0))
      WHEN (
        LOWER(r.status) IN ('repaired','collected','unrepairable','completed','done','fixed','closed','picked_up','handover')
        OR LOWER(r.status) LIKE '%complet%' OR LOWER(r.status) LIKE '%pick%' OR LOWER(r.status) LIKE '%collect%'
      ) THEN COALESCE(r.actual_cost, r.estimated_cost, 0)
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
    AND (
      LOWER(r.status) IN ('repaired','collected','unrepairable','completed','done','fixed','closed','picked_up','handover')
      OR LOWER(r.status) LIKE '%complet%' OR LOWER(r.status) LIKE '%pick%' OR LOWER(r.status) LIKE '%collect%'
    )
    AND r.updated_at::date BETWEEN p_start_date AND p_end_date;

  -- Keep the two components' pre-combined values for the breakdown fields
  -- below; v_cogs itself still becomes the same combined total it always was.
  v_sales_cogs       := v_cogs;
  v_repair_parts_cogs := v_repair_cogs;
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

  SELECT COALESCE(SUM(CASE WHEN type = 'cash_in' THEN amount ELSE -amount END), 0)
  INTO v_cash_net
  FROM cash_movements
  WHERE branch_id = p_branch_id
    AND created_at::date BETWEEN p_start_date AND p_end_date;

  RETURN jsonb_build_object(
    'revenue',        v_revenue,
    'repair_revenue', v_repairs,
    'repair_revenue_booked', v_repairs_booked,
    'other_income',   v_cash_net,
    'total_revenue',  v_revenue + v_repairs + v_cash_net,
    'cogs',           v_cogs,
    'sales_cogs',        v_sales_cogs,
    'repair_parts_cogs', v_repair_parts_cogs,
    'expenses',       v_expenses,
    'salaries',       v_salaries,
    'total_costs',    v_cogs + v_expenses + v_salaries,
    'gross_profit',   (v_revenue + v_repairs) - v_cogs,
    'net_profit',     (v_revenue + v_repairs + v_cash_net) - v_cogs - v_expenses - v_salaries
  );
END;
$$;
