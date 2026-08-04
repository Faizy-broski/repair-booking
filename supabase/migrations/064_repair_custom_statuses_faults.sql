-- ============================================================
-- 064_repair_custom_statuses_faults.sql
-- Per-business custom repair statuses (with color) and faults
-- ============================================================

CREATE TABLE IF NOT EXISTS repair_custom_statuses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#09d6f1',
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_custom_statuses_business
  ON repair_custom_statuses(business_id);

CREATE TABLE IF NOT EXISTS repair_faults (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repair_faults_business
  ON repair_faults(business_id);

-- RLS
ALTER TABLE repair_custom_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_faults           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_repair_statuses" ON repair_custom_statuses
  USING (business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "tenant_repair_faults" ON repair_faults
  USING (business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
  ));
