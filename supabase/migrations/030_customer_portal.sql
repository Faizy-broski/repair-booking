-- Migration 030: Customer Self-Service Portal
-- Customers log in via email magic-link (OTP) to view their tickets and invoices.

CREATE TABLE IF NOT EXISTS customer_portal_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  otp         TEXT,                  -- 6-digit one-time code sent to email/phone
  otp_expires TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_token      ON customer_portal_sessions(token);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_customer   ON customer_portal_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_business   ON customer_portal_sessions(business_id);

ALTER TABLE customer_portal_sessions ENABLE ROW LEVEL SECURITY;

-- Service role only (API routes use adminSupabase)
CREATE POLICY "portal_sessions_service_only" ON customer_portal_sessions
  USING (false);
