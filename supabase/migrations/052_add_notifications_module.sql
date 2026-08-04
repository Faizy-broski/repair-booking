-- ============================================================
-- 052_add_notifications_module.sql
-- Adds 'notifications' as the 14th module.
-- Updates CHECK constraints, the resolve_all function,
-- default templates, and seeds existing businesses.
-- ============================================================

-- ── 1. Update CHECK constraint on module_config_templates ─────────────────
ALTER TABLE module_config_templates
  DROP CONSTRAINT IF EXISTS module_config_templates_module_check;

ALTER TABLE module_config_templates
  ADD CONSTRAINT module_config_templates_module_check
  CHECK (module IN (
    'pos','inventory','repairs','customers','appointments',
    'expenses','employees','reports','messages','invoices',
    'gift_cards','google_reviews','phone','notifications'
  ));

-- ── 2. Update CHECK constraint on business_module_access ──────────────────
ALTER TABLE business_module_access
  DROP CONSTRAINT IF EXISTS business_module_access_module_check;

ALTER TABLE business_module_access
  ADD CONSTRAINT business_module_access_module_check
  CHECK (module IN (
    'pos','inventory','repairs','customers','appointments',
    'expenses','employees','reports','messages','invoices',
    'gift_cards','google_reviews','phone','notifications'
  ));

-- ── 3. Update CHECK constraint on branch_module_overrides ─────────────────
ALTER TABLE branch_module_overrides
  DROP CONSTRAINT IF EXISTS branch_module_overrides_module_check;

ALTER TABLE branch_module_overrides
  ADD CONSTRAINT branch_module_overrides_module_check
  CHECK (module IN (
    'pos','inventory','repairs','customers','appointments',
    'expenses','employees','reports','messages','invoices',
    'gift_cards','google_reviews','phone','notifications'
  ));

-- ── 4. Update resolve_all_module_configs to include notifications ──────────
CREATE OR REPLACE FUNCTION public.resolve_all_module_configs(
  p_branch_id UUID
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_result  JSONB := '{}';
  v_module  TEXT;
  v_modules TEXT[] := ARRAY[
    'pos','inventory','repairs','customers','appointments',
    'expenses','employees','reports','messages','invoices',
    'gift_cards','google_reviews','phone','notifications'
  ];
BEGIN
  FOREACH v_module IN ARRAY v_modules LOOP
    v_result := v_result || jsonb_build_object(
      v_module,
      public.resolve_module_config(p_branch_id, v_module)
    );
  END LOOP;
  RETURN v_result;
END;
$$;

-- ── 5. Insert default notifications template ──────────────────────────────
INSERT INTO module_config_templates (module, name, description, settings, is_default)
VALUES (
  'notifications',
  'Default Notifications',
  'Standard notification settings — email, SMS, and push alerts',
  '{"email_enabled": true, "sms_enabled": false, "push_enabled": false,
    "notify_on_new_repair": true, "notify_on_status_change": true,
    "notify_on_payment": true, "notify_on_low_stock": false}',
  TRUE
)
ON CONFLICT (module, name) DO NOTHING;

-- ── 6. Seed business_module_access for all existing businesses ─────────────
-- Inserts a notifications row for every business that doesn't already have one.
-- is_enabled=TRUE so existing businesses get the module immediately;
-- superadmin can turn it off per-business via the module sheet.
INSERT INTO business_module_access (
  business_id, module, is_enabled, plan_override, template_id, template_version
)
SELECT
  b.id,
  'notifications',
  TRUE,
  NULL,  -- respect plan ceiling
  (SELECT id FROM module_config_templates WHERE module = 'notifications' AND is_default = TRUE),
  1
FROM businesses b
ON CONFLICT (business_id, module) DO NOTHING;
