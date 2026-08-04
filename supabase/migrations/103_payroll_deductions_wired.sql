-- ============================================================================
-- 103 — Wire up purchase deductions into payroll calculation + settlement
-- ============================================================================
-- What this migration does:
--   1. Adds settled_purchase_ids UUID[] to payroll_periods for reversal tracking
--   2. Replaces calculate_payroll() to include purchase_deductions + net_pay
--   3. Adds settle_payroll_purchases()   — called when payroll is marked 'paid'
--   4. Adds unsettle_payroll_purchases() — called when payroll is reopened
-- ============================================================================

-- 1. Audit column: which sale IDs were settled by this payroll period
ALTER TABLE payroll_periods
  ADD COLUMN IF NOT EXISTS settled_purchase_ids UUID[] NOT NULL DEFAULT '{}';

-- 2. Replace calculate_payroll() — new return columns: purchase_deductions, net_pay
--    Signature change (extra return columns) requires DROP + CREATE.
DROP FUNCTION IF EXISTS calculate_payroll(UUID, UUID, DATE, DATE);

CREATE FUNCTION calculate_payroll(
  p_employee_id UUID,
  p_branch_id   UUID,
  p_start_date  DATE,
  p_end_date    DATE
)
RETURNS TABLE (
  total_hours         NUMERIC,
  hourly_pay          NUMERIC,
  commission_total    NUMERIC,
  base_salary         NUMERIC,
  gross_pay           NUMERIC,
  purchase_deductions NUMERIC,
  net_pay             NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hourly_rate     NUMERIC;
  v_monthly_salary  NUMERIC;
  v_prorated_salary NUMERIC;
  v_hours           NUMERIC;
  v_commission      NUMERIC;
  v_gross           NUMERIC;
  v_purchases       NUMERIC;
  v_deductions      NUMERIC;
BEGIN
  SELECT COALESCE(hourly_rate, 0), COALESCE(base_salary, 0)
    INTO v_hourly_rate, v_monthly_salary
    FROM employees WHERE id = p_employee_id;

  -- Pro-rate the monthly base salary across the exact days in this period.
  SELECT COALESCE(SUM(
    v_monthly_salary / EXTRACT(DAY FROM (date_trunc('month', d) + INTERVAL '1 month - 1 day'))
  ), 0)
  INTO v_prorated_salary
  FROM generate_series(p_start_date, p_end_date, '1 day'::interval) AS d;

  SELECT COALESCE(
    SUM(
      EXTRACT(EPOCH FROM (
        COALESCE(clock_out, NOW()) - clock_in
      )) / 3600.0
      - COALESCE(break_minutes, 0) / 60.0
    ), 0
  ) INTO v_hours
  FROM time_clocks
  WHERE employee_id = p_employee_id
    AND branch_id   = p_branch_id
    AND clock_in   >= p_start_date
    AND clock_in   <  p_end_date + INTERVAL '1 day';

  SELECT COALESCE(SUM(amount), 0) INTO v_commission
    FROM employee_commissions
   WHERE employee_id = p_employee_id
     AND status IN ('pending','approved')
     AND created_at >= p_start_date
     AND created_at <  p_end_date + INTERVAL '1 day';

  v_gross := ROUND(v_prorated_salary + v_hours * v_hourly_rate + v_commission, 2);

  -- Sum all outstanding employee purchases up to the period end date.
  SELECT COALESCE(SUM(total - COALESCE(amount_paid, 0)), 0)
  INTO v_purchases
  FROM sales
  WHERE employee_id   = p_employee_id
    AND is_refund     = false
    AND is_exchange   = false
    AND payment_status IN ('on_account', 'partial')
    AND created_at::date <= p_end_date;

  -- Clamp deductions so net_pay never goes below 0.
  v_deductions := LEAST(ROUND(v_purchases, 2), v_gross);

  RETURN QUERY SELECT
    ROUND(v_hours, 2)::NUMERIC,
    ROUND(v_hours * v_hourly_rate, 2)::NUMERIC,
    ROUND(v_commission, 2)::NUMERIC,
    ROUND(v_prorated_salary, 2)::NUMERIC,
    v_gross,
    v_deductions,
    ROUND(v_gross - v_deductions, 2)::NUMERIC;
END;
$$;

-- 3. settle_payroll_purchases — marks employee's outstanding purchases as settled
--    when the payroll period is marked 'paid'. Processes oldest purchases first,
--    up to the purchase_deductions amount recorded on the period.
CREATE OR REPLACE FUNCTION settle_payroll_purchases(p_payroll_period_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_employee_id UUID;
  v_budget      NUMERIC;
  v_remaining   NUMERIC;
  v_sale        RECORD;
  v_outstanding NUMERIC;
  v_payment     NUMERIC;
  v_settled     UUID[] := '{}';
BEGIN
  SELECT employee_id, COALESCE(purchase_deductions, 0)
  INTO v_employee_id, v_budget
  FROM payroll_periods WHERE id = p_payroll_period_id;

  IF v_budget <= 0 THEN RETURN; END IF;

  v_remaining := v_budget;

  FOR v_sale IN
    SELECT id, total, COALESCE(amount_paid, 0) AS paid,
           COALESCE(payment_splits, '[]'::jsonb) AS splits
    FROM sales
    WHERE employee_id   = v_employee_id
      AND is_refund     = false
      AND is_exchange   = false
      AND payment_status IN ('on_account', 'partial')
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_outstanding := v_sale.total - v_sale.paid;
    v_payment     := LEAST(v_remaining, v_outstanding);

    UPDATE sales SET
      amount_paid    = amount_paid + v_payment,
      payment_status = CASE
        WHEN amount_paid + v_payment >= total THEN 'paid'
        ELSE 'partial'
      END,
      payment_splits = v_sale.splits || jsonb_build_object(
        'method',            'payroll_deduction',
        'amount',            v_payment,
        'payroll_period_id', p_payroll_period_id::text
      )
    WHERE id = v_sale.id;

    v_remaining := v_remaining - v_payment;
    v_settled   := v_settled || ARRAY[v_sale.id];
  END LOOP;

  UPDATE payroll_periods SET settled_purchase_ids = v_settled WHERE id = p_payroll_period_id;
END;
$$;

-- 4. unsettle_payroll_purchases — reverses settle_payroll_purchases.
--    Called when a paid/approved payroll is reopened for correction.
CREATE OR REPLACE FUNCTION unsettle_payroll_purchases(p_payroll_period_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sale_id        UUID;
  v_splits         JSONB;
  v_new_splits     JSONB;
  v_new_amount     NUMERIC;
BEGIN
  FOR v_sale_id IN
    SELECT UNNEST(settled_purchase_ids)
    FROM payroll_periods WHERE id = p_payroll_period_id
  LOOP
    SELECT COALESCE(payment_splits, '[]'::jsonb)
    INTO v_splits
    FROM sales WHERE id = v_sale_id FOR UPDATE;

    -- Remove the payroll_deduction entry added by this specific period.
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    INTO v_new_splits
    FROM jsonb_array_elements(v_splits) AS elem
    WHERE NOT (
      (elem->>'method')            = 'payroll_deduction' AND
      (elem->>'payroll_period_id') = p_payroll_period_id::text
    );

    -- Recalculate amount_paid from remaining splits.
    SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
    INTO v_new_amount
    FROM jsonb_array_elements(v_new_splits) AS elem;

    UPDATE sales SET
      amount_paid    = v_new_amount,
      payment_status = CASE
        WHEN v_new_amount <= 0         THEN 'on_account'
        WHEN v_new_amount >= total     THEN 'paid'
        ELSE                                'partial'
      END,
      payment_splits = v_new_splits
    WHERE id = v_sale_id;
  END LOOP;

  UPDATE payroll_periods SET settled_purchase_ids = '{}' WHERE id = p_payroll_period_id;
END;
$$;
