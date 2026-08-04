-- ============================================================================
-- 092 — Pro-rate base_salary in payroll calculation
-- ============================================================================
-- Bug fixed: calculate_payroll() previously added the employee's FULL
-- employees.base_salary (a monthly figure) to every payroll period regardless
-- of how long that period actually covered. A business running weekly payroll
-- would pay the full monthly salary 4+ times over.
--
-- Fix: pro-rate by summing, for each calendar day in [start_date, end_date],
-- that day's share of its own month (base_salary / days_in_that_month). This:
--   - Sums to exactly base_salary when the period is a full calendar month
--   - Correctly handles weekly/bi-weekly periods (smaller fraction)
--   - Correctly handles periods spanning a month boundary (each day uses its
--     own month's day count)
--
-- Return signature (column names/types) is unchanged from migration 088, so
-- CREATE OR REPLACE is safe here — no DROP FUNCTION needed this time.
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_payroll(
  p_employee_id UUID,
  p_branch_id   UUID,
  p_start_date  DATE,
  p_end_date    DATE
)
RETURNS TABLE (
  total_hours      NUMERIC,
  hourly_pay       NUMERIC,
  commission_total NUMERIC,
  base_salary      NUMERIC,
  gross_pay        NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hourly_rate     NUMERIC;
  v_monthly_salary  NUMERIC;
  v_prorated_salary NUMERIC;
  v_hours           NUMERIC;
  v_commission      NUMERIC;
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

  RETURN QUERY SELECT
    ROUND(v_hours, 2)::NUMERIC,
    ROUND(v_hours * v_hourly_rate, 2)::NUMERIC,
    ROUND(v_commission, 2)::NUMERIC,
    ROUND(v_prorated_salary, 2)::NUMERIC,
    ROUND(v_prorated_salary + v_hours * v_hourly_rate + v_commission, 2)::NUMERIC;
END;
$$;
