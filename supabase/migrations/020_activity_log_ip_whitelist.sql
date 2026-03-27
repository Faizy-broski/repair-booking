-- ── Phase 6 continued — Activity Log & IP Whitelisting ───────────────────────

-- 6.6 Employee Activity Log (insert-only audit trail)
CREATE TABLE IF NOT EXISTS employee_activity_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id    UUID REFERENCES branches(id),
  user_id      UUID NOT NULL REFERENCES profiles(id),
  module       TEXT NOT NULL,
  action       TEXT NOT NULL,
  record_id    UUID,
  table_name   TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user    ON employee_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_business ON employee_activity_log(business_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created  ON employee_activity_log(created_at DESC);

-- RLS: insert-only (no UPDATE, no DELETE permitted for non-superadmin)
ALTER TABLE employee_activity_log ENABLE ROW LEVEL SECURITY;

-- Business members can view their own business logs
CREATE POLICY "activity_log_select" ON employee_activity_log
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Anyone authenticated in the business can insert
CREATE POLICY "activity_log_insert" ON employee_activity_log
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT business_id FROM profiles WHERE id = auth.uid()
    )
  );

-- No UPDATE policy = updates are denied
-- No DELETE policy = deletes are denied

-- 6.7 IP Whitelisting Per Employee
CREATE TABLE IF NOT EXISTS employee_ip_whitelist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address   TEXT NOT NULL,
  label        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, profile_id, ip_address)
);

CREATE INDEX IF NOT EXISTS idx_ip_whitelist_profile ON employee_ip_whitelist(profile_id);
