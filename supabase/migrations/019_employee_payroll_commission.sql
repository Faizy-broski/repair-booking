-- ── Phase 6 — Employees & Payroll Depth ─────────────────────────────────────

-- 6.1 Granular Role Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  module        TEXT NOT NULL,
  action        TEXT NOT NULL,
  allowed       BOOLEAN NOT NULL DEFAULT true,
  requires_pin  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, role, module, action)
);

-- 6.2 PIN — add access_pin to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS access_pin TEXT;
-- commission_rate as a default for the employee (overridden by commission_rules)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 0;

-- 6.3 Shift Management
CREATE TABLE IF NOT EXISTS shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id     UUID NOT NULL REFERENCES branches(id),
  name          TEXT NOT NULL,
  start_time    TEXT NOT NULL,  -- e.g. '09:00'
  end_time      TEXT NOT NULL,  -- e.g. '17:00'
  days_of_week  INT[] NOT NULL DEFAULT '{1,2,3,4,5}',  -- 0=Sun,1=Mon...6=Sat
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_shifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id        UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shift_id, employee_id, effective_from)
);

-- 6.4 Payroll Periods
CREATE TABLE IF NOT EXISTS payroll_periods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id         UUID NOT NULL REFERENCES branches(id),
  employee_id       UUID NOT NULL REFERENCES employees(id),
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  total_hours       NUMERIC(8,2) NOT NULL DEFAULT 0,
  hourly_rate       NUMERIC(10,2) NOT NULL DEFAULT 0,
  hourly_pay        NUMERIC(10,2) GENERATED ALWAYS AS (total_hours * hourly_rate) STORED,
  commission_total  NUMERIC(10,2) NOT NULL DEFAULT 0,
  gross_pay         NUMERIC(10,2) GENERATED ALWAYS AS (total_hours * hourly_rate + commission_total) STORED,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  notes             TEXT,
  approved_by       UUID REFERENCES profiles(id),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll_periods(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_branch ON payroll_periods(branch_id);

-- 6.5 Commission Rules & Commissions
CREATE TABLE IF NOT EXISTS commission_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  applies_to   TEXT NOT NULL DEFAULT 'all' CHECK (applies_to IN ('all','sales','repairs')),
  rate_type    TEXT NOT NULL DEFAULT 'percent' CHECK (rate_type IN ('percent','flat')),
  rate         NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_amount   NUMERIC(10,2) DEFAULT 0,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_commissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES employees(id),
  source_type  TEXT NOT NULL CHECK (source_type IN ('sale','repair')),
  source_id    UUID NOT NULL,
  rule_id      UUID REFERENCES commission_rules(id),
  amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_employee ON employee_commissions(employee_id);

-- ── Function: Calculate Payroll ───────────────────────────────────────────────
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
  gross_pay        NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hourly_rate NUMERIC;
  v_hours       NUMERIC;
  v_commission  NUMERIC;
BEGIN
  -- Get employee hourly rate
  SELECT COALESCE(hourly_rate, 0) INTO v_hourly_rate
    FROM employees WHERE id = p_employee_id;

  -- Sum hours from time_clocks
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

  -- Sum commissions in the period
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
    ROUND(v_hours * v_hourly_rate + v_commission, 2)::NUMERIC;
END;
$$;
