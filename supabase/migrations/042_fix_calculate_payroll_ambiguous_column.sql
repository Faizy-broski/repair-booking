-- ── Fix: calculate_payroll ambiguous "base_salary" column reference ────────
-- The live version of this function (edited directly on the database, out of
-- sync with 019_employee_payroll_commission.sql) throws:
--   ERROR 42702: column reference "base_salary" is ambiguous
-- because a RETURNS TABLE output column shares a name with employees.base_salary
-- and a query inside the function body reads it unqualified. This blocks
-- payroll-period creation entirely (POST /api/employees/payroll).
--
-- Restores the working definition from 019, with every column reference
-- explicitly table-qualified so this can't recur. base_salary is not part of
-- this function's output — payroll_periods.gross_pay is a GENERATED column
-- computed only from total_hours * hourly_rate + commission_total, so an
-- output column for base_salary here couldn't affect gross_pay anyway; the
-- app already reads employees.base_salary directly where it's needed for
-- display (src/backend/services/payroll.service.ts calculate()).

DROP FUNCTION IF EXISTS calculate_payroll(
    UUID,
    UUID,
    DATE,
    DATE
);

CREATE FUNCTION calculate_payroll(
  p_employee_id UUID,
  p_branch_id   UUID,
  p_start_date  DATE,
  p_end_date    DATE
)
RETURNS TABLE (
  total_hours      NUMERIC,
  hourly_pay       NUMERIC,
  commission_total NUMERIC,
  gross_pay        NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hourly_rate NUMERIC;
  v_hours       NUMERIC;
  v_commission  NUMERIC;
BEGIN
  -- Get employee hourly rate
  SELECT COALESCE(e.hourly_rate, 0) INTO v_hourly_rate
    FROM employees e WHERE e.id = p_employee_id;

  -- Sum hours from time_clocks
  SELECT COALESCE(
    SUM(
      EXTRACT(EPOCH FROM (
        COALESCE(tc.clock_out, NOW()) - tc.clock_in
      )) / 3600.0
      - COALESCE(tc.break_minutes, 0) / 60.0
    ), 0
  ) INTO v_hours
  FROM time_clocks tc
  WHERE tc.employee_id = p_employee_id
    AND tc.branch_id   = p_branch_id
    AND tc.clock_in   >= p_start_date
    AND tc.clock_in   <  p_end_date + INTERVAL '1 day';

  -- Sum commissions in the period
  SELECT COALESCE(SUM(ec.amount), 0) INTO v_commission
    FROM employee_commissions ec
   WHERE ec.employee_id = p_employee_id
     AND ec.status IN ('pending','approved')
     AND ec.created_at >= p_start_date
     AND ec.created_at <  p_end_date + INTERVAL '1 day';

  RETURN QUERY SELECT
    ROUND(v_hours, 2)::NUMERIC,
    ROUND(v_hours * v_hourly_rate, 2)::NUMERIC,
    ROUND(v_commission, 2)::NUMERIC,
    ROUND(v_hours * v_hourly_rate + v_commission, 2)::NUMERIC;
END;
$$;
