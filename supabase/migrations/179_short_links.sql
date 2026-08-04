-- ============================================================================
-- 179 — Short links for customer-facing messages (WhatsApp/email invoice links)
-- ============================================================================
-- Wraps long signed PDF URLs (e.g. Supabase Storage signed URLs with a long
-- JWT token) behind a short /s/{code} redirect, so links shared over WhatsApp
-- or email are short and don't look suspicious/broken when wrapped by chat apps.
--
-- Accessed exclusively via the service-role key: created server-side
-- (repair.controller.ts) and resolved server-side by the public redirect
-- route (src/app/s/[code]/route.ts) — no RLS policies needed, same pattern
-- as pending_registrations/impersonation_sessions.

CREATE TABLE IF NOT EXISTS short_links (
  code        TEXT PRIMARY KEY,
  target_url  TEXT NOT NULL,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_short_links_expires ON short_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_short_links_business ON short_links(business_id);

ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;
