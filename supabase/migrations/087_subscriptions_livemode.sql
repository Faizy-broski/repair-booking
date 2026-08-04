-- Add livemode flag to subscriptions so super-admin stats exclude test-mode Stripe data.
-- Default FALSE so existing rows are treated as test until explicitly synced/confirmed.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS livemode BOOLEAN NOT NULL DEFAULT false;

-- Index so filtering is fast on the stats query
CREATE INDEX IF NOT EXISTS idx_subscriptions_livemode ON subscriptions (livemode);
