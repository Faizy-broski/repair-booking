-- ── Payroll hours-calculation correctness ───────────────────────────────────
--
-- 1) calculate_payroll uncapped-hours bug (the big one):
--    The previous version summed `COALESCE(clock_out, NOW()) - clock_in` with
--    no upper bound. If an employee forgets to clock out, that shift stays
--    "open" and keeps accruing hours against ANY payroll period whose date
--    range includes the clock_in — including periods created days or weeks
--    later, since the WHERE clause only bounds clock_in, not clock_out. E.g.
--    an employee clocks in on the last day of a weekly period and forgets to
--    clock out; two weeks later when payroll finally gets run, that one
--    open shift alone contributes ~336 hours. This silently and massively
--    overpays real employees. Fixed by capping every shift's counted end time
--    at the period boundary (`p_end_date + 1 day`) as well as NOW() — hours
--    worked after the period ends belong to the NEXT payroll period, not this
--    one, exactly like GRN/POS date-range reports already do elsewhere.
--
-- 2) Per-row hours are also floored at 0 (GREATEST(..., 0)) rather than
--    letting a single bad manual entry (break_minutes bigger than the actual
--    shift, or a mistyped clock_out) drag the whole period's total down or
--    negative — see the new CHECK constraints below for the actual source of
--    truth fix, this is defense in depth for rows that predate them.
--
-- DROP + CREATE rather than CREATE OR REPLACE: this repo's live database has
-- drifted from its migration files before (see 042's own comment) — Postgres
-- refuses CREATE OR REPLACE when the existing function's signature doesn't
-- match, so dropping it first is what actually guarantees this applies.
DROP FUNCTION IF EXISTS calculate_payroll(UUID, UUID, DATE, DATE);

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
  v_period_end  TIMESTAMPTZ := p_end_date + INTERVAL '1 day';
BEGIN
  SELECT COALESCE(e.hourly_rate, 0) INTO v_hourly_rate
    FROM employees e WHERE e.id = p_employee_id;

  SELECT COALESCE(
    SUM(
      GREATEST(
        EXTRACT(EPOCH FROM (
          LEAST(COALESCE(tc.clock_out, NOW()), v_period_end) - tc.clock_in
        )) / 3600.0
        - COALESCE(tc.break_minutes, 0) / 60.0,
        0
      )
    ), 0
  ) INTO v_hours
  FROM time_clocks tc
  WHERE tc.employee_id = p_employee_id
    AND tc.branch_id   = p_branch_id
    AND tc.clock_in   >= p_start_date
    AND tc.clock_in   <  v_period_end;

  SELECT COALESCE(SUM(ec.amount), 0) INTO v_commission
    FROM employee_commissions ec
   WHERE ec.employee_id = p_employee_id
     AND ec.status IN ('pending','approved')
     AND ec.created_at >= p_start_date
     AND ec.created_at <  v_period_end;

  RETURN QUERY SELECT
    ROUND(v_hours, 2)::NUMERIC,
    ROUND(v_hours * v_hourly_rate, 2)::NUMERIC,
    ROUND(v_commission, 2)::NUMERIC,
    ROUND(v_hours * v_hourly_rate + v_commission, 2)::NUMERIC;
END;
$$;

-- ── time_clocks data-quality guards ──────────────────────────────────────────
-- Nothing previously stopped a manual attendance entry (createManualClockEntry
-- — used for backfilling a missed clock-out) from having clock_out before
-- clock_in, or a break longer than the shift itself; either silently produces
-- negative hours for that row, quietly reducing the whole period's pay. These
-- constraints reject that at the database level regardless of which code path
-- writes the row.
--
-- ADDING A CHECK CONSTRAINT VALIDATES EVERY EXISTING ROW. If real historical
-- data already has a bad row (typo'd manual entry, clock_out before clock_in,
-- negative break_minutes), this ALTER fails and the migration stops here.
-- Find offenders first with:
--   SELECT * FROM time_clocks WHERE clock_out IS NOT NULL AND clock_out <= clock_in;
--   SELECT * FROM time_clocks WHERE break_minutes < 0;
-- and either fix or delete them before re-running.
ALTER TABLE time_clocks
  ADD CONSTRAINT time_clocks_clock_out_after_in CHECK (clock_out IS NULL OR clock_out > clock_in),
  ADD CONSTRAINT time_clocks_break_minutes_nonneg CHECK (break_minutes IS NULL OR break_minutes >= 0);

-- At most one open (not-yet-clocked-out) shift per employee. Without this, two
-- concurrent "Clock In" requests for the same employee (double-tap, flaky
-- network retry) each pass the app's "am I already clocked in?" check before
-- either commits, creating two open shifts — the employee then effectively
-- gets double-counted hours once both eventually get an end time within the
-- same payroll period.
--
-- If any employee already has more than one open shift today (from before
-- this index existed), creating it fails. Find them first with:
--   SELECT employee_id, COUNT(*) FROM time_clocks WHERE clock_out IS NULL
--     GROUP BY employee_id HAVING COUNT(*) > 1;
-- and clock out/close the stale duplicate(s) before re-running.
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_clocks_one_open_shift
  ON time_clocks(employee_id) WHERE clock_out IS NULL;

-- ── Payroll ↔ salaries (expense) linkage ─────────────────────────────────────
-- markPaid() previously linked a payroll period to the `salaries` row it
-- created purely via a string match on `notes` ('Payroll period <id>'). If
-- that note is ever hand-edited, or a future feature lets `salaries.notes` be
-- user-editable, reopen() silently fails to find/delete the entry — the
-- reversal quietly does nothing and the stale salary expense keeps counting
-- toward P&L forever. A real foreign key removes that fragility.
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS payroll_period_id UUID REFERENCES payroll_periods(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_salaries_payroll_period ON salaries(payroll_period_id);

-- ── Prevent overlapping payroll periods at the database level ───────────────
-- PayrollService.create() already blocks overlapping periods with a
-- check-then-insert SELECT, but that's an application-level guard, not a
-- database one — two concurrent "Create Payroll Period" submissions for the
-- same employee and overlapping dates could both pass that check before
-- either commits, double-paying the overlapping days. This constraint makes
-- the database itself the source of truth.
--
-- NOTE: if this migration fails here, it means overlapping payroll periods
-- already exist in the data (from before this constraint existed) — find them
-- with the query below and resolve manually before re-running:
--   SELECT a.id, b.id FROM payroll_periods a JOIN payroll_periods b
--     ON a.employee_id = b.employee_id AND a.id < b.id
--     AND daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]');
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE payroll_periods
  ADD CONSTRAINT payroll_periods_no_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  );
