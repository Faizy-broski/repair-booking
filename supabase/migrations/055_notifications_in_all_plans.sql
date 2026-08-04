-- ============================================================
-- 055_notifications_in_all_plans.sql
--
-- Root cause: migration 052 added 'notifications' as module 14
-- and seeded business_module_access rows (plan_override=NULL),
-- but never added 'notifications' to any plan's features[] array.
-- Because resolve_module_config checks:
--   v_plan_enabled := plans.features @> '"notifications"'
-- ...and no plan contained it, v_plan_enabled was always false,
-- so the module was always hidden regardless of upgrade.
--
-- This migration:
--   1. Adds 'notifications' to every plan's features[] that is
--      currently active (Starter, Pro, Enterprise, Trial).
--   2. Updates the business-create trigger to seed 14 modules.
--   3. Sets plan_override = TRUE on existing business_module_access
--      rows for 'notifications' so businesses that were already
--      seeded by migration 052 show it immediately without waiting
--      for a fresh subscription upsert.
-- ============================================================

-- ── 1. Add notifications to ALL active plans ──────────────────────────────
-- Notifications is a cross-cutting concern (email/SMS/push alerts)
-- that should be available on every plan tier.
-- The || operator on JSONB arrays appends without duplicating thanks
-- to the WHERE NOT EXISTS guard.

UPDATE plans
SET features = features || '["notifications"]'::jsonb
WHERE is_active = TRUE
  AND NOT (features @> '"notifications"'::jsonb);

-- ── 2. Update business-create trigger to seed 14 modules ─────────────────
-- Migration 026 defined this with 13 modules; notifications was missing.
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
    'gift_cards','google_reviews','phone','notifications'
  ]) AS module_value
  ON CONFLICT (business_id, module) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── 3. Fix existing business_module_access rows seeded by migration 052 ───
-- Those rows have plan_override = NULL (respects plan ceiling).
-- Now that plans.features includes notifications, the plan ceiling will
-- allow it — so plan_override = NULL is correct going forward.
-- However, to be safe and ensure these rows are unconditionally enabled
-- (superadmin can always restrict per-business), set plan_override = TRUE.
-- This means: "this business has notifications regardless of plan tier",
-- which is the intent for a cross-plan feature.
UPDATE business_module_access
SET plan_override = TRUE
WHERE module = 'notifications'
  AND plan_override IS NULL;
