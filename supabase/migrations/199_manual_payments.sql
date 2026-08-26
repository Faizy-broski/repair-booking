-- Migration 199: Manual (offline) payment ledger for super admin.
--
-- Some businesses pay the platform owner directly (bank transfer, cash,
-- cheque) instead of through Stripe. Until now there was nowhere to record
-- that a payment happened, how much, by what method, or for which billing
-- period — the Businesses/Subscriptions super-admin pages only ever reflect
-- Stripe invoices. This adds a per-business payment ledger, modeled on the
-- existing sale_payments ledger (migration 120): per-row, created_by +
-- created_at, no RLS policies since it's only ever touched via
-- createAdminClient() service-role access from super-admin API routes (same
-- as `subscriptions`).

CREATE TABLE IF NOT EXISTS manual_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  amount        NUMERIC(10,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'gbp',
  -- Which plan this payment was for — the amount is always derived server-side
  -- from this plan's price (or the business's negotiated custom price), never
  -- typed in free-hand, so the ledger always says what was actually paid for.
  plan_id       UUID REFERENCES plans(id),
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly','yearly')),
  -- 'bank_transfer' | 'cash' | 'cheque' | 'other'
  method        TEXT NOT NULL,
  -- Bank transaction ref / cheque number / whatever ties this to the real transfer
  reference     TEXT,
  paid_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Billing period this payment covers, if the admin recorded one
  period_start  TIMESTAMPTZ,
  period_end    TIMESTAMPTZ,
  notes         TEXT,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Belt-and-braces for anyone who already ran an earlier version of this file
-- against their database, back when the table had no plan_id/billing_cycle —
-- CREATE TABLE IF NOT EXISTS above silently no-ops on an existing table, so
-- these columns need to be added explicitly to reach the current shape.
ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS plan_id       UUID REFERENCES plans(id);
ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IN ('monthly','yearly'));

CREATE INDEX IF NOT EXISTS idx_manual_payments_business ON manual_payments(business_id);
CREATE INDEX IF NOT EXISTS idx_manual_payments_paid_at  ON manual_payments(paid_at);

-- This is an internal super-admin billing ledger, not a tenant-facing feature
-- (unlike `subscriptions`, which the business owner can read their own row
-- of — see migration 002). Without RLS, Supabase's default grants would
-- expose every business's payment ledger to any authenticated user via the
-- client-side SDK. All application access goes through createAdminClient()
-- (service role, bypasses RLS) — this policy is a defense-in-depth backstop,
-- reusing the public.user_role() helper already defined in 002_rls_policies.sql.
ALTER TABLE manual_payments ENABLE ROW LEVEL SECURITY;

-- DROP + CREATE (rather than a bare CREATE POLICY) so this file can be
-- re-run safely — Postgres has no "CREATE POLICY IF NOT EXISTS".
DROP POLICY IF EXISTS "super_admin_manual_payments" ON manual_payments;
CREATE POLICY "super_admin_manual_payments" ON manual_payments
  FOR ALL TO authenticated
  USING (public.user_role() = 'super_admin')
  WITH CHECK (public.user_role() = 'super_admin');
