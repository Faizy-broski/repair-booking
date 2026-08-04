-- Migration 112: check_plan_limit — support custom-plan overrides
--
-- Supersedes migration 058's version. Adds one thing on top of it:
-- when the business's subscription has is_custom = true, max_branches/
-- max_users/max_products/max_services are resolved from the
-- subscriptions.custom_* columns instead of the joined plans row.
-- Every other limit key (max_customers, max_appointments_per_month,
-- etc.) is unaffected and still falls back to the plans.limits jsonb,
-- since the custom-plan builder only controls those 4 dimensions.
--
-- For is_custom = false (every existing subscription today), this
-- function is byte-for-byte identical in behavior to migration 058's
-- version — the new branch is simply never taken.
--
-- Uses PL/pgSQL's built-in FOUND variable (set automatically after every
-- SELECT INTO, regardless of target shape) to detect "no matching row" —
-- NOT a hand-rolled boolean column, which would be nulled out along with
-- every other scalar target on a zero-row match and silently break the
-- free-plan fallback below.

CREATE OR REPLACE FUNCTION check_plan_limit(
  p_business_id uuid,
  p_limit_key text,
  p_current_count int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_branches int;
  v_max_users int;
  v_limits jsonb;
  v_is_custom boolean := false;
  v_custom_max_branches int;
  v_custom_max_users int;
  v_custom_max_products int;
  v_custom_max_services int;
  v_limit_value int;
  v_allowed boolean;
BEGIN
  -- Try to get the plan for this business via subscription (active or trialing),
  -- plus any custom-plan overrides sitting on the same row.
  SELECT
    p.max_branches, p.max_users, p.limits,
    s.is_custom, s.custom_max_branches, s.custom_max_users,
    s.custom_max_products, s.custom_max_services
  INTO
    v_max_branches, v_max_users, v_limits,
    v_is_custom, v_custom_max_branches, v_custom_max_users,
    v_custom_max_products, v_custom_max_services
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.business_id = p_business_id
    AND s.status IN ('active', 'trialing')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- No active subscription: fall back to the free plan limits so the business
  -- can still operate. Custom overrides never apply here — there's no
  -- subscription row to read them from.
  IF NOT FOUND THEN
    v_is_custom := false;
    SELECT p.max_branches, p.max_users, p.limits
    INTO v_max_branches, v_max_users, v_limits
    FROM plans p
    WHERE p.plan_type = 'free'
      AND p.is_active = true
    ORDER BY p.created_at ASC
    LIMIT 1;

    -- Still nothing found (no plans seeded at all) → allow everything.
    IF NOT FOUND THEN
      RETURN jsonb_build_object('allowed', true, 'limit', null, 'current', p_current_count, 'reason', null);
    END IF;
  END IF;

  -- Custom-plan overrides for the 4 dimensions the builder controls.
  -- Only these four keys are ever affected; every other limit key falls
  -- through to the placeholder plan's limits jsonb exactly as before.
  IF v_is_custom AND p_limit_key = 'max_branches' THEN
    v_limit_value := v_custom_max_branches;
  ELSIF v_is_custom AND p_limit_key = 'max_users' THEN
    v_limit_value := v_custom_max_users;
  ELSIF v_is_custom AND p_limit_key = 'max_products' THEN
    v_limit_value := v_custom_max_products;
  ELSIF v_is_custom AND p_limit_key = 'max_services' THEN
    v_limit_value := v_custom_max_services;
  ELSIF p_limit_key = 'max_branches' THEN
    v_limit_value := v_max_branches;
  ELSIF p_limit_key = 'max_users' THEN
    v_limit_value := v_max_users;
  ELSE
    v_limit_value := (v_limits ->> p_limit_key)::int;
  END IF;

  -- NULL limit = unlimited. Explicit, not an incidental side effect of the
  -- comparison below (Postgres NULL >= x is always NULL/falsy, never true,
  -- so relying on that implicitly would be fragile to refactor).
  IF v_limit_value IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'limit', null, 'current', p_current_count, 'reason', null);
  END IF;

  v_allowed := p_current_count < v_limit_value;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'limit',   v_limit_value,
    'current', p_current_count,
    'reason',  CASE
                 WHEN NOT v_allowed
                 THEN 'Plan limit reached (' || p_limit_key || ': ' || v_limit_value || ')'
                 ELSE null
               END
  );
END;
$$;
