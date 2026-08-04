-- ============================================================================
-- 045 — Add Stripe IDs to businesses table
-- The checkout, webhook, and check-registration flows all write
-- stripe_customer_id and stripe_subscription_id to the businesses row so
-- the invoices API can look up payment history without a subscriptions join.
-- ============================================================================

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Index for fast lookup by Stripe customer (used by webhook and billing API)
CREATE INDEX IF NOT EXISTS idx_businesses_stripe_customer
  ON businesses(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
