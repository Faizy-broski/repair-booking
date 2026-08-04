-- ============================================================================
-- 042 — Free Plan & Trial Enforcement
-- ============================================================================

-- 1. Add plan_type to plans table
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'paid'
    CHECK (plan_type IN ('free', 'paid', 'enterprise'));

COMMENT ON COLUMN plans.plan_type IS
  'free = no card, 30-day trial then upgrade required | paid = Stripe subscription | enterprise = custom/manual';

-- 2. Update existing plans
UPDATE plans SET plan_type = 'enterprise' WHERE price_monthly = 0;
UPDATE plans SET plan_type = 'paid'       WHERE price_monthly > 0;

-- 3. Add Free plan (skip if already exists)
INSERT INTO plans (name, price_monthly, max_branches, max_users, features, plan_type, is_active)
SELECT 'Free', 0.00, 1, 2,
  '["pos","repairs","inventory"]'::jsonb,
  'free', true
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE plan_type = 'free');

-- 4. Add trial_ends_at to businesses table (tracks free plan expiry)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN businesses.trial_ends_at IS
  'Set on free plan signup. After this date the business is locked until they upgrade.';

-- 5. View: easy access to a business current subscription status
CREATE OR REPLACE VIEW business_subscription_status AS
SELECT
  b.id              AS business_id,
  b.subdomain,
  b.is_active,
  b.trial_ends_at,
  s.id              AS subscription_id,
  s.status          AS subscription_status,
  s.trial_ends_at   AS sub_trial_ends_at,
  p.plan_type,
  p.name            AS plan_name,
  -- Is access currently allowed?
  CASE
    WHEN b.is_suspended THEN FALSE
    WHEN NOT b.is_active THEN FALSE
    WHEN p.plan_type = 'free' AND b.trial_ends_at IS NOT NULL AND b.trial_ends_at < NOW() THEN FALSE
    WHEN s.status IN ('active', 'trialing') THEN TRUE
    WHEN s.status IS NULL AND p.plan_type = 'free' AND (b.trial_ends_at IS NULL OR b.trial_ends_at >= NOW()) THEN TRUE
    ELSE FALSE
  END               AS has_access,
  -- Is the free trial expired?
  CASE
    WHEN p.plan_type = 'free' AND b.trial_ends_at IS NOT NULL AND b.trial_ends_at < NOW() THEN TRUE
    ELSE FALSE
  END               AS free_trial_expired
FROM businesses b
LEFT JOIN subscriptions s ON s.business_id = b.id
  AND s.created_at = (SELECT MAX(s2.created_at) FROM subscriptions s2 WHERE s2.business_id = b.id)
LEFT JOIN plans p ON p.id = s.plan_id;
