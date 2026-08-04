-- Migration 097: Helpdesk Tickets
-- Allows business owners and branch managers to raise support tickets with the
-- platform super-admin team. Tickets are scoped by business_id.

CREATE TABLE IF NOT EXISTS helpdesk_tickets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number BIGINT      GENERATED ALWAYS AS IDENTITY,
  business_id   UUID        NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id     UUID        REFERENCES branches(id) ON DELETE SET NULL,
  created_by    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  title         TEXT        NOT NULL,
  description   TEXT,
  category      TEXT        NOT NULL DEFAULT 'Technical Support',
  status        TEXT        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority      TEXT        NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Unique sequential ticket number per business
CREATE UNIQUE INDEX IF NOT EXISTS idx_helpdesk_tickets_number
  ON helpdesk_tickets(ticket_number);

-- Most common query: list tickets for a business ordered by newest
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_business_created
  ON helpdesk_tickets(business_id, created_at DESC);

-- Status filter
CREATE INDEX IF NOT EXISTS idx_helpdesk_tickets_status
  ON helpdesk_tickets(business_id, status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_helpdesk_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_helpdesk_updated_at
  BEFORE UPDATE ON helpdesk_tickets
  FOR EACH ROW EXECUTE FUNCTION set_helpdesk_updated_at();

-- RLS: business users see only their own tickets; super_admin sees all
ALTER TABLE helpdesk_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY helpdesk_business_access ON helpdesk_tickets
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM profiles WHERE id = auth.uid()
    )
  );
