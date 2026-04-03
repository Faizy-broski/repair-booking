-- ============================================================
-- 023_appointment_booking.sql
-- Phase 9: Appointment Booking System
-- Business hours, booking config, public booking support
-- ============================================================

-- ── Business Hours (per branch, per day-of-week) ──────────────────────────────

CREATE TABLE business_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
  open_time   TIME NOT NULL DEFAULT '09:00',
  close_time  TIME NOT NULL DEFAULT '17:00',
  is_closed   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, day_of_week)
);

CREATE INDEX idx_business_hours_branch ON business_hours(branch_id);

-- ── Booking Settings (per branch) ────────────────────────────────────────────

CREATE TABLE booking_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id             UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE UNIQUE,
  is_enabled            BOOLEAN DEFAULT false,
  slot_duration_minutes INT DEFAULT 30 CHECK (slot_duration_minutes > 0),
  buffer_minutes        INT DEFAULT 0  CHECK (buffer_minutes >= 0),
  max_per_slot          INT DEFAULT 1  CHECK (max_per_slot > 0),
  max_advance_days      INT DEFAULT 30 CHECK (max_advance_days > 0),
  min_advance_hours     INT DEFAULT 1  CHECK (min_advance_hours >= 0),
  require_approval      BOOLEAN DEFAULT false,
  cancellation_hours    INT DEFAULT 24 CHECK (cancellation_hours >= 0),
  widget_accent_color   TEXT DEFAULT '#2563eb',
  widget_welcome_text   TEXT DEFAULT 'Book an appointment with us',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Blocked Dates (holidays / closures per branch) ───────────────────────────

CREATE TABLE blocked_dates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(branch_id, blocked_date)
);

CREATE INDEX idx_blocked_dates_branch ON blocked_dates(branch_id);

-- ── Extend appointments table ────────────────────────────────────────────────

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS service_id       UUID REFERENCES service_problems(id),
  ADD COLUMN IF NOT EXISTS booking_source   TEXT DEFAULT 'walk_in'
                                            CHECK (booking_source IN ('walk_in','phone','online','widget')),
  ADD COLUMN IF NOT EXISTS customer_name    TEXT,
  ADD COLUMN IF NOT EXISTS customer_email   TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone   TEXT,
  ADD COLUMN IF NOT EXISTS customer_note    TEXT,
  ADD COLUMN IF NOT EXISTS booking_token    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS no_show          BOOLEAN DEFAULT false;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX idx_appointments_service    ON appointments(service_id);
CREATE INDEX idx_appointments_source     ON appointments(booking_source);
CREATE INDEX idx_appointments_token      ON appointments(booking_token);

-- ── Add 'no_show' to status check (recreate constraint) ─────────────────────

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled','confirmed','cancelled','completed','no_show'));

-- ── RLS Policies ─────────────────────────────────────────────────────────────

ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;

-- Business Hours: owner/manager see all branches for their business
CREATE POLICY "owner_manages_business_hours" ON business_hours
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_reads_business_hours" ON business_hours
  FOR SELECT TO authenticated
  USING (branch_id = public.user_branch_id());

-- Booking Settings: owner/manager only
CREATE POLICY "owner_manages_booking_settings" ON booking_settings
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_reads_booking_settings" ON booking_settings
  FOR SELECT TO authenticated
  USING (branch_id = public.user_branch_id());

-- Blocked Dates: owner/manager manages, staff reads
CREATE POLICY "owner_manages_blocked_dates" ON blocked_dates
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_reads_blocked_dates" ON blocked_dates
  FOR SELECT TO authenticated
  USING (branch_id = public.user_branch_id());

-- ── Seed default business hours for existing branches ────────────────────────

INSERT INTO business_hours (branch_id, day_of_week, open_time, close_time, is_closed)
SELECT b.id, dow.d,
  CASE WHEN dow.d IN (0, 6) THEN '10:00'::TIME ELSE '09:00'::TIME END,
  CASE WHEN dow.d IN (0, 6) THEN '16:00'::TIME ELSE '17:30'::TIME END,
  CASE WHEN dow.d = 0 THEN true ELSE false END
FROM branches b
CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6)) AS dow(d)
ON CONFLICT (branch_id, day_of_week) DO NOTHING;
