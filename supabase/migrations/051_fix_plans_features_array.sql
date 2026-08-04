-- ============================================================
-- 051_fix_plans_features_array.sql
--
-- The plans.features column is declared JSONB DEFAULT '[]' (array)
-- and the resolve_module_config function checks membership with:
--   features @> to_jsonb(p_module)
-- which only works when features is a JSON ARRAY.
--
-- Early plan rows created via the superadmin UI were accidentally
-- stored as JSONB OBJECTS {"pos": true, "repairs": false, ...}
-- because the API schema used z.record(z.string(), z.boolean()).
-- This migration converts any such objects to the correct array
-- format (only keys where the value was true are kept).
-- ============================================================

-- Convert object-format features → array of enabled module names.
-- Plans whose features is already an array are left untouched.
UPDATE plans
SET features = (
  SELECT COALESCE(jsonb_agg(kv.key ORDER BY kv.key), '[]'::jsonb)
  FROM jsonb_each(features) AS kv
  WHERE kv.value = 'true'::jsonb
)
WHERE jsonb_typeof(features) = 'object';

-- Safety: set NULL to empty array
UPDATE plans
SET features = '[]'::jsonb
WHERE features IS NULL;
