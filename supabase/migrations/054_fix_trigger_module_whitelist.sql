-- ============================================================
-- 054_fix_trigger_module_whitelist.sql
-- Migration 052 added 'notifications' as the 14th module but
-- did not update the two trigger functions that seed
-- business_module_access on INSERT / UPDATE OF plan_id.
-- Without this fix, new businesses and plan-upgrade events
-- never get a business_module_access row for 'notifications',
-- so superadmins cannot manage it per-business in the UI.
-- (The SQL resolve function still falls back to plan-ceiling
--  logic, so the module is visible — but having an explicit row
--  is required for the management sheet and future grant/revoke.)
-- ============================================================

-- ── 1. Update INSERT trigger (new subscription = new business) ────────────
CREATE OR REPLACE FUNCTION public.seed_business_module_access_on_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO business_module_access (
    business_id,
    module,
    is_enabled,
    template_id,
    template_version
  )
  SELECT
    NEW.business_id,
    module_value,
    TRUE,
    (SELECT id FROM module_config_templates WHERE module = module_value AND is_default = TRUE),
    1
  FROM (
    SELECT jsonb_array_elements_text(
      COALESCE(
        (SELECT features FROM plans WHERE id = NEW.plan_id),
        '[]'::JSONB
      )
    ) AS module_value
  ) AS m
  WHERE module_value IN (
    'pos','inventory','repairs','customers','appointments',
    'expenses','employees','reports','messages','invoices',
    'gift_cards','google_reviews','phone','notifications'
  )
  ON CONFLICT (business_id, module) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── 2. Update UPDATE trigger (plan_id change = upgrade / downgrade) ───────
CREATE OR REPLACE FUNCTION public.seed_business_module_access_on_plan_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
    INSERT INTO business_module_access (
      business_id,
      module,
      is_enabled,
      template_id,
      template_version
    )
    SELECT
      NEW.business_id,
      module_value,
      TRUE,
      (SELECT id FROM module_config_templates WHERE module = module_value AND is_default = TRUE),
      1
    FROM (
      SELECT jsonb_array_elements_text(
        COALESCE(
          (SELECT features FROM plans WHERE id = NEW.plan_id),
          '[]'::JSONB
        )
      ) AS module_value
    ) AS m
    WHERE module_value IN (
      'pos','inventory','repairs','customers','appointments',
      'expenses','employees','reports','messages','invoices',
      'gift_cards','google_reviews','phone','notifications'
    )
    ON CONFLICT (business_id, module) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
-- Triggers themselves do not need to be recreated — they already point to
-- the functions above. CREATE OR REPLACE on the functions is sufficient.
