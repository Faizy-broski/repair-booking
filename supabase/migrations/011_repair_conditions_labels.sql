-- ============================================================
-- 011_repair_conditions_labels.sql
-- Pre/post condition checklists + ticket labels for repairs
-- ============================================================

-- ── Condition checklist items per repair ────────────────────
CREATE TABLE repair_condition_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id  UUID NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL CHECK (stage IN ('pre', 'post')),
  label      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'damaged', 'missing')),
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_repair_condition_items_repair_id ON repair_condition_items(repair_id);

-- ── Per-business condition templates ────────────────────────
CREATE TABLE repair_condition_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  repair_category TEXT NOT NULL DEFAULT 'general',
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_repair_condition_templates_business ON repair_condition_templates(business_id);

-- ── Ticket labels ───────────────────────────────────────────
CREATE TABLE ticket_labels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_labels_business ON ticket_labels(business_id);

-- Add label_ids array to repairs
ALTER TABLE repairs ADD COLUMN IF NOT EXISTS label_ids UUID[] DEFAULT '{}';
