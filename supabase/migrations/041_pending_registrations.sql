-- ============================================================================
-- 041 — Pending Registrations
-- Temporarily stores registration data until Stripe payment is confirmed.
-- Records are deleted immediately after account creation by the webhook.
-- Expires after 2 hours to prevent stale data accumulation.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pending_registrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name    TEXT NOT NULL,
  subdomain        TEXT NOT NULL UNIQUE,
  email            TEXT NOT NULL UNIQUE,
  phone            TEXT,
  full_name        TEXT NOT NULL,
  -- Plaintext password stored only temporarily; deleted after account creation
  password_temp    TEXT NOT NULL,
  main_branch_name TEXT NOT NULL,
  plan_id          UUID REFERENCES plans(id) ON DELETE SET NULL,
  stripe_session_id TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2 hours'
);

COMMENT ON TABLE pending_registrations IS
  'Temporary pre-payment registration data. Row deleted immediately after account is created by Stripe webhook.';

-- Index for webhook lookup by Stripe session ID
CREATE INDEX IF NOT EXISTS idx_pending_reg_session ON pending_registrations(stripe_session_id);

-- Index for cleanup job on expiry
CREATE INDEX IF NOT EXISTS idx_pending_reg_expires ON pending_registrations(expires_at);

-- No RLS needed: only accessed by service role (backend)
