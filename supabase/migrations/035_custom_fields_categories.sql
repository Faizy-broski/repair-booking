-- Migration 035: Custom Fields — fix module enum + add repair_category scoping

-- 1. Migrate existing 'repair' values to 'repairs' before changing constraint
UPDATE custom_field_definitions SET module = 'repairs' WHERE module = 'repair';
UPDATE custom_field_definitions SET module = 'customers' WHERE module = 'customer';
UPDATE custom_field_definitions SET module = 'expenses' WHERE module = 'expense';
UPDATE custom_field_definitions SET module = 'appointments' WHERE module = 'appointment';

-- 2. Drop old constraint and add new one matching MODULES constant
ALTER TABLE custom_field_definitions DROP CONSTRAINT IF EXISTS custom_field_definitions_module_check;
ALTER TABLE custom_field_definitions ADD CONSTRAINT custom_field_definitions_module_check
  CHECK (module IN ('pos','inventory','repairs','customers','appointments','expenses','employees','reports','messages','invoices','gift_cards','google_reviews','phone'));

-- 3. Add repair_category (nullable — if null the field applies to ALL repair categories)
ALTER TABLE custom_field_definitions
  ADD COLUMN IF NOT EXISTS repair_category TEXT DEFAULT NULL;

-- 4. Extend field_type to include 'checkbox' (as alias for boolean) and 'textarea'
ALTER TABLE custom_field_definitions DROP CONSTRAINT IF EXISTS custom_field_definitions_field_type_check;
ALTER TABLE custom_field_definitions ADD CONSTRAINT custom_field_definitions_field_type_check
  CHECK (field_type IN ('text','textarea','number','select','date','boolean','checkbox','phone','email'));

-- 5. Index for efficient lookup by module + category
CREATE INDEX IF NOT EXISTS idx_custom_fields_module_cat
  ON custom_field_definitions(business_id, module, repair_category);
