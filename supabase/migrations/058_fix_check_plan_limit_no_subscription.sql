-- Migration 058: Fix check_plan_limit when business has no subscription row
--
-- Problem: check_plan_limit returns { allowed: false, reason: 'No active subscription' }
-- when a business has no row in the subscriptions table (e.g. free-trial businesses
-- that were registered before a subscription row was created).  This blocks all
-- plan-gated actions (creating branches, products, etc.) and shows the unhelpful
-- message "Your plan allows undefined branches."
--
-- Fix: fall back to the free plan limits when no active subscription is found.

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
  v_plan_row record;
  v_limit_value int;
  v_allowed boolean;
BEGIN
  -- Try to get the plan for this business via subscription (active or trialing).
  SELECT p.max_branches, p.max_users, p.limits
  INTO v_plan_row
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.business_id = p_business_id
    AND s.status IN ('active', 'trialing')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- No active subscription: fall back to the free plan limits so the business
  -- can still operate.  Any free-plan business that is within their trial window
  -- should be allowed the same limits as the free plan.
  IF v_plan_row IS NULL THEN
    SELECT p.max_branches, p.max_users, p.limits
    INTO v_plan_row
    FROM plans p
    WHERE p.plan_type = 'free'
      AND p.is_active = true
    ORDER BY p.created_at ASC
    LIMIT 1;
  END IF;

  -- Still NULL (no plans seeded at all) → allow everything.
  IF v_plan_row IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'limit', null, 'current', p_current_count, 'reason', null);
  END IF;

  -- Resolve the relevant limit column.
  IF p_limit_key = 'max_branches' THEN
    v_limit_value := v_plan_row.max_branches;
  ELSIF p_limit_key = 'max_users' THEN
    v_limit_value := v_plan_row.max_users;
  ELSE
    v_limit_value := (v_plan_row.limits ->> p_limit_key)::int;
  END IF;

  -- NULL limit = unlimited.
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
