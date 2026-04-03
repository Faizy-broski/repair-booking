-- ============================================================
-- 026_fix_module_trial_defaults.sql
--
-- Two fixes:
-- 1. resolve_module_config: default is_enabled = TRUE when the
--    business has no active subscription (trial / dev mode).
--    Previously it was FALSE, which hid all modules for new businesses.
-- 2. Fix seed plan features to use correct module names and include
--    all modules. Also seed business_module_access for businesses
--    that currently have no rows (registered but no subscription).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Fix plan seed data — use canonical module names
-- ────────────────────────────────────────────────────────────
UPDATE plans SET features = '["pos","inventory","repairs","customers","reports","invoices"]'
  WHERE name = 'Starter';

UPDATE plans SET features = '["pos","inventory","repairs","customers","appointments","expenses","employees","reports","messages","invoices","gift_cards"]'
  WHERE name = 'Pro';

UPDATE plans SET features = '["pos","inventory","repairs","customers","appointments","expenses","employees","reports","messages","invoices","gift_cards","google_reviews","phone"]'
  WHERE name = 'Enterprise';

-- ────────────────────────────────────────────────────────────
-- 2. Rewrite resolve_module_config to default is_enabled = TRUE
--    when there is no active subscription (no plan ceiling).
--    This enables the "free trial" / dev experience.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_module_config(
  p_branch_id UUID,
  p_module    TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_business_id   UUID;
  v_plan_features JSONB;
  v_plan_enabled  BOOLEAN;
  v_bma           RECORD;
  v_template_cfg  JSONB := '{}';
  v_template_name TEXT  := NULL;
  v_branch_cfg    JSONB := '{}';
  v_resolved      JSONB;
BEGIN
  -- 1. Resolve business from branch
  SELECT business_id INTO v_business_id
    FROM branches WHERE id = p_branch_id;

  IF v_business_id IS NULL THEN
    RETURN jsonb_build_object('_meta', jsonb_build_object(
      'module', p_module, 'is_enabled', FALSE,
      'template_id', NULL, 'template_name', NULL, 'has_override', FALSE
    ));
  END IF;

  -- 2. Check plan ceiling (plans.features is JSONB array of module strings)
  SELECT p.features INTO v_plan_features
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.business_id = v_business_id
      AND s.status IN ('trialing','active','past_due')
    ORDER BY s.created_at DESC
    LIMIT 1;

  -- No subscription = trial/dev mode → treat all modules as plan-enabled
  IF v_plan_features IS NULL THEN
    v_plan_enabled := TRUE;
  ELSE
    v_plan_enabled := v_plan_features @> to_jsonb(p_module);
  END IF;

  -- 3. Load business module access record
  SELECT * INTO v_bma
    FROM business_module_access
    WHERE business_id = v_business_id AND module = p_module;

  -- 4. Load template settings
  IF v_bma.template_id IS NOT NULL THEN
    SELECT settings, name INTO v_template_cfg, v_template_name
      FROM module_config_templates WHERE id = v_bma.template_id;
    v_template_cfg := COALESCE(v_template_cfg, '{}');
  END IF;

  -- 5. Load branch overrides
  SELECT settings_override INTO v_branch_cfg
    FROM branch_module_overrides
    WHERE branch_id = p_branch_id AND module = p_module;
  v_branch_cfg := COALESCE(v_branch_cfg, '{}');

  -- 6. Deep merge: template <- business_override <- branch_override
  v_resolved := jsonb_strip_nulls(
    v_template_cfg
    || COALESCE(v_bma.settings_override, '{}')
    || v_branch_cfg
  );

  -- 7. Compute final is_enabled:
  --    plan_override takes precedence over plan ceiling;
  --    is_enabled can additionally disable within plan
  v_resolved := v_resolved || jsonb_build_object(
    '_meta', jsonb_build_object(
      'module',        p_module,
      'is_enabled',    COALESCE(v_bma.plan_override, v_plan_enabled)
                       AND COALESCE(v_bma.is_enabled, TRUE),
      'template_id',   v_bma.template_id,
      'template_name', v_template_name,
      'has_override',  (v_bma.settings_override IS NOT NULL
                        AND v_bma.settings_override <> '{}')
                       OR (v_branch_cfg <> '{}')
    )
  );

  RETURN v_resolved;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. Back-fill business_module_access for businesses that have
--    no rows at all (registered but never got a subscription).
--    Enables all 13 modules with is_enabled = TRUE.
-- ────────────────────────────────────────────────────────────
INSERT INTO business_module_access (business_id, module, is_enabled, template_id, template_version)
SELECT
  b.id AS business_id,
  m.module,
  TRUE AS is_enabled,
  (SELECT id FROM module_config_templates WHERE module = m.module AND is_default = TRUE),
  1
FROM businesses b
CROSS JOIN (
  SELECT unnest(ARRAY[
    'pos','inventory','repairs','customers','appointments',
    'expenses','employees','reports','messages','invoices',
    'gift_cards','google_reviews','phone'
  ]) AS module
) AS m
WHERE NOT EXISTS (
  SELECT 1 FROM business_module_access bma
  WHERE bma.business_id = b.id
)
ON CONFLICT (business_id, module) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 4. Also update the registration trigger to seed all modules
--    for new businesses immediately on business creation,
--    not waiting for a subscription.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_business_module_access_on_business_create()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO business_module_access (
    business_id, module, is_enabled, template_id, template_version
  )
  SELECT
    NEW.id,
    module_value,
    TRUE,
    (SELECT id FROM module_config_templates WHERE module = module_value AND is_default = TRUE),
    1
  FROM unnest(ARRAY[
    'pos','inventory','repairs','customers','appointments',
    'expenses','employees','reports','messages','invoices',
    'gift_cards','google_reviews','phone'
  ]) AS module_value
  ON CONFLICT (business_id, module) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_business_module_access_on_create
  AFTER INSERT ON businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_business_module_access_on_business_create();
