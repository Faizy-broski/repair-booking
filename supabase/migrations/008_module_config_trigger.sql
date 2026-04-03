-- ============================================================
-- 007_module_config_trigger.sql
-- Automatically seed business_module_access when a new
-- subscription is created (i.e. when a business pays and
-- gets a plan assigned via Stripe webhook or direct insert).
--
-- This closes the gap where businesses created AFTER migration
-- 006 runs would not have any business_module_access rows,
-- causing all modules to appear disabled.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- FUNCTION: seed_business_module_access_on_subscription()
-- Triggered AFTER INSERT on subscriptions.
-- Inserts one business_module_access row per module listed in
-- the plan's features JSONB array. Skips any that already exist
-- (ON CONFLICT DO NOTHING) so safe to run multiple times.
-- ────────────────────────────────────────────────────────────
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
  -- Valid module values only (guards against stale/corrupt plan data)
  WHERE module_value IN (
    'pos','inventory','repairs','customers','appointments',
    'expenses','employees','reports','messages','invoices',
    'gift_cards','google_reviews','phone'
  )
  ON CONFLICT (business_id, module) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- TRIGGER: after INSERT on subscriptions
-- Fires once per new subscription row.
-- ────────────────────────────────────────────────────────────
CREATE TRIGGER trg_seed_business_module_access
  AFTER INSERT ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_business_module_access_on_subscription();

-- ────────────────────────────────────────────────────────────
-- Also handle plan upgrades: when plan_id changes on an existing
-- subscription, add access for any new modules in the new plan.
-- Existing rows are left untouched (DO NOTHING on conflict).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_business_module_access_on_plan_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only run when plan_id has actually changed
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
      'gift_cards','google_reviews','phone'
    )
    ON CONFLICT (business_id, module) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_business_module_access_on_upgrade
  AFTER UPDATE OF plan_id ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_business_module_access_on_plan_change();
