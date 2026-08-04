-- ============================================================
-- 053_subscriptions_unique_business.sql
--
-- Each business can only have one active subscription row.
-- Without this UNIQUE constraint, Supabase upsert(onConflict:'business_id')
-- throws a Postgres error (no matching unique constraint), causing all
-- plan-upgrade writes to fail silently.
--
-- We deduplicate first (keep the most recent row per business),
-- then add the constraint.
-- ============================================================

-- 1. Remove duplicate subscription rows, keeping the most recent per business
DELETE FROM subscriptions
WHERE id NOT IN (
  SELECT DISTINCT ON (business_id) id
  FROM subscriptions
  ORDER BY business_id, created_at DESC
);

-- 2. Add the unique constraint
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_business_id_key UNIQUE (business_id);
