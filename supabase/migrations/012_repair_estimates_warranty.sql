-- ============================================================
-- 012_repair_estimates_warranty.sql
-- Repair estimates workflow + warranty countdown
-- ============================================================

-- ── Repair estimates ────────────────────────────────────────
CREATE TABLE repair_estimates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id     UUID REFERENCES repairs(id) ON DELETE CASCADE,
  business_id   UUID NOT NULL REFERENCES businesses(id),
  branch_id     UUID NOT NULL REFERENCES branches(id),
  customer_id   UUID NOT NULL REFERENCES customers(id),
  items         JSONB NOT NULL DEFAULT '[]'::jsonb,
  total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','declined','changes_requested')),
  customer_note TEXT,
  signature_data TEXT,
  sent_at       TIMESTAMPTZ,
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_repair_estimates_repair_id    ON repair_estimates(repair_id);
CREATE INDEX idx_repair_estimates_business_id  ON repair_estimates(business_id);
CREATE INDEX idx_repair_estimates_customer_id  ON repair_estimates(customer_id);

-- ── Warranty on repair_items ─────────────────────────────────
ALTER TABLE repair_items ADD COLUMN IF NOT EXISTS warranty_days    INT DEFAULT 0;
ALTER TABLE repair_items ADD COLUMN IF NOT EXISTS warranty_starts_at TIMESTAMPTZ;

-- ── collected_at on repairs ──────────────────────────────────
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- When a repair status changes to 'collected', auto-set collected_at
-- and set warranty_starts_at on each repair_item that has warranty_days > 0
CREATE OR REPLACE FUNCTION handle_repair_collected()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'collected' AND (OLD.status IS DISTINCT FROM 'collected') THEN
    NEW.collected_at = NOW();
    UPDATE repair_items
    SET warranty_starts_at = NOW()
    WHERE repair_id = NEW.id
      AND warranty_days > 0
      AND warranty_starts_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_repair_collected ON repairs;
CREATE TRIGGER trg_repair_collected
  BEFORE UPDATE ON repairs
  FOR EACH ROW EXECUTE FUNCTION handle_repair_collected();

-- ── Invoice status + partial payment ─────────────────────────
-- (1.12 — status column already exists from 001_initial_schema.sql with values 'issued','paid','void')
-- Drop any check constraint on invoices.status (auto-named by Postgres) then re-add expanded version
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'invoices'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE 'ALTER TABLE invoices DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END;
$$;

ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('issued','paid','void','unpaid','partial','refunded'));

-- Add partial-payment tracking column
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) DEFAULT 0;

-- Map legacy 'issued' → 'unpaid' so the new UI logic works correctly
UPDATE invoices SET status = 'unpaid' WHERE status = 'issued';
