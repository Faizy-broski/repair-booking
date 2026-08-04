-- ============================================================================
-- 174 — Vehicles table (Mobile Tyre Fitting vertical)
-- Vehicles belong to a customer (reg number, make/model, preferred tyre size)
-- so jobs and job history can be looked up by vehicle as well as by customer.
-- ============================================================================

CREATE TABLE IF NOT EXISTS vehicles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  registration_number TEXT NOT NULL,
  make                TEXT,
  model               TEXT,
  colour              TEXT,
  tyre_size           TEXT,
  notes               TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE vehicles IS 'Customer vehicles (reg/make/model/tyre size) for the mobile tyre fitting vertical. No unique constraint on registration_number — plates get mistyped and can legitimately be reassigned, so duplicates are resolved as a soft UI prompt, not a DB constraint.';

CREATE INDEX IF NOT EXISTS idx_vehicles_business ON vehicles(business_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_reg_number ON vehicles(registration_number);

-- Trigram index for partial/fuzzy plate search (e.g. staff typing a partial plate).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_vehicles_reg_trgm ON vehicles USING gin (registration_number gin_trgm_ops);

CREATE TRIGGER set_updated_at_vehicles
  BEFORE UPDATE ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();
