-- ============================================================
-- 014_ticket_workflows_canned.sql
-- Custom ticket workflows + canned responses
-- ============================================================

-- ── Custom Ticket Workflows ──────────────────────────────────────────────────

CREATE TABLE ticket_workflows (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ticket_workflow_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES ticket_workflows(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  required_role TEXT,
  step_order  INT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one default workflow per business
CREATE UNIQUE INDEX idx_one_default_workflow
  ON ticket_workflows(business_id)
  WHERE is_default = true;

ALTER TABLE repairs ADD COLUMN IF NOT EXISTS workflow_id      UUID REFERENCES ticket_workflows(id);
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS current_step_id  UUID REFERENCES ticket_workflow_steps(id);

CREATE INDEX idx_ticket_workflows_business ON ticket_workflows(business_id);
CREATE INDEX idx_workflow_steps_workflow   ON ticket_workflow_steps(workflow_id);

-- ── Status Flag Messages ─────────────────────────────────────────────────────

CREATE TABLE repair_status_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, status)
);

CREATE INDEX idx_repair_status_flags_business ON repair_status_flags(business_id);

-- ── Canned Responses ─────────────────────────────────────────────────────────

CREATE TABLE canned_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        TEXT DEFAULT 'note' CHECK (type IN ('note', 'sms', 'email')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_canned_responses_business ON canned_responses(business_id);
