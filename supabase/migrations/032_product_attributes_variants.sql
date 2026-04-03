-- Product Attributes & Variant Attribute Storage
-- Allows any business to define attributes (Color, Size, Network, etc.)
-- and assign attribute combinations to product_variants

CREATE TABLE IF NOT EXISTS product_attributes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  is_default   BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, name)
);

CREATE TABLE IF NOT EXISTS product_attribute_values (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attribute_id UUID NOT NULL REFERENCES product_attributes(id) ON DELETE CASCADE,
  value        TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(attribute_id, value)
);

-- Store attribute key→value pairs on each variant
-- e.g. { "Color": "Black", "Storage": "128GB", "Network": "Unlocked" }
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}';

-- Mark the product as having variants enabled
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS has_variants BOOLEAN NOT NULL DEFAULT false;

-- RLS for product_attributes
ALTER TABLE product_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_access_product_attributes"
  ON product_attributes FOR ALL
  USING (business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
  ));

-- RLS for product_attribute_values
ALTER TABLE product_attribute_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_access_product_attribute_values"
  ON product_attribute_values FOR ALL
  USING (attribute_id IN (
    SELECT pa.id FROM product_attributes pa
    JOIN profiles pr ON pr.business_id = pa.business_id
    WHERE pr.id = auth.uid()
  ));

-- Seed default attributes for all existing businesses
INSERT INTO product_attributes (business_id, name, is_default, display_order)
SELECT b.id, attr.name, true, attr.ord
FROM businesses b
CROSS JOIN (VALUES
  ('Condition',            1),
  ('Color',                2),
  ('Network',              3),
  ('Size',                 4),
  ('Storage',              5),
  ('Condition on Purchase',6),
  ('Condition on Sale',    7)
) AS attr(name, ord)
ON CONFLICT (business_id, name) DO NOTHING;
