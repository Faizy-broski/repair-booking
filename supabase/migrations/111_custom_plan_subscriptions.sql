-- ============================================================
-- 111_custom_plan_subscriptions.sql
-- Adds support for a customer-built "Custom Plan" alongside the
-- fixed Starter/Growth/Professional catalog. Custom numbers live on
-- the subscriptions row itself (is_custom + custom_* columns), not
-- as one-off rows in the shared `plans` catalog, so:
--   - GET /api/plans (public) never leaks a customer's private numbers
--   - plans stays a small, superadmin-managed, reusable catalog
--   - subscriptions.plan_id (NOT NULL FK) stays satisfied via one
--     shared inactive placeholder "Custom Plan" row
--
-- Purely additive: existing rows get is_custom = false / NULL
-- overrides and are completely unaffected by this migration.
-- ============================================================

BEGIN;

-- ── Allow 'custom' as a plan_type without hardcoding the existing
-- CHECK constraint's auto-generated name (discovered dynamically so
-- this migration doesn't depend on guessing correctly).
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'plans'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%plan_type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE plans DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE plans
    ADD CONSTRAINT plans_plan_type_check
    CHECK (plan_type IN ('free', 'paid', 'enterprise', 'custom'));
END $$;

-- ── One shared, inactive placeholder plan row so subscriptions.plan_id
-- (NOT NULL FK) is always satisfiable for a custom subscription. Never
-- shown publicly (is_active = false excludes it from GET /api/plans'
-- default query). Same module set as Starter — only the numeric limits
-- differ per business, stored on the subscription row, not here.
INSERT INTO plans (name, price_monthly, max_branches, max_users, features, limits, plan_type, is_active)
SELECT
  'Custom Plan', 19.00, 1, 5,
  '["pos","repairs","inventory","customers","reports","expenses","employees"]'::jsonb,
  '{"max_products":500,"max_services":100}'::jsonb,
  'custom', false
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE plan_type = 'custom');

-- ── Per-business custom overrides, all nullable, all default-inert.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS is_custom           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_max_branches  int,
  ADD COLUMN IF NOT EXISTS custom_max_users     int,
  ADD COLUMN IF NOT EXISTS custom_max_products  int,  -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS custom_max_services  int,  -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS custom_price_monthly numeric(10,2);

COMMENT ON COLUMN subscriptions.is_custom IS
  'When true, check_plan_limit() and PlanLimitService.getPlanLimits() must read the custom_* '
  'columns on this row instead of the joined plans row (plan_id still points at the shared '
  '"Custom Plan" placeholder purely for FK integrity — it does not hold the real numbers).';

COMMIT;
