-- ============================================================================
-- 094 — Category Attributes: link product_attributes to categories
-- ============================================================================
-- Retail-store vertical: each category (e.g. Shoes, Electronics) can have a
-- set of attributes (e.g. Size, Color) that auto-populate in the product form.
-- ============================================================================

CREATE TABLE IF NOT EXISTS category_attributes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  UUID        NOT NULL REFERENCES categories(id)         ON DELETE CASCADE,
  attribute_id UUID        NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  business_id  UUID        NOT NULL REFERENCES businesses(id)         ON DELETE CASCADE,
  display_order INT        NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, attribute_id)
);

CREATE INDEX IF NOT EXISTS idx_category_attributes_category
  ON category_attributes(category_id);

CREATE INDEX IF NOT EXISTS idx_category_attributes_business
  ON category_attributes(business_id);

-- RLS
ALTER TABLE category_attributes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON category_attributes;

CREATE POLICY "tenant_isolation" ON category_attributes
  USING (
    business_id = (
      SELECT business_id FROM profiles
      WHERE id = auth.uid()
      LIMIT 1
    )
  );
