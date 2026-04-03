-- ============================================================================
-- 040: Catalogue Hierarchy
-- Device Type (categories) → Brand → Model (service_devices) → Part Types
-- ============================================================================

-- 1. Brands belong to a Device Type (category)
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_brands_category ON brands(category_id);

-- 2. Models (service_devices) belong to a Brand
ALTER TABLE service_devices
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_svc_devices_brand ON service_devices(brand_id);

-- 3. Part Types table — linked to Model (service_devices)
--    e.g. "iPhone 15 Pro" → Screen, Battery, IC
--    e.g. "ThinkPad X1" → Keyboard, Screen, Trackpad
CREATE TABLE IF NOT EXISTS part_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  device_id   UUID REFERENCES service_devices(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, device_id, name)
);

CREATE INDEX IF NOT EXISTS idx_part_types_business  ON part_types(business_id);
CREATE INDEX IF NOT EXISTS idx_part_types_device    ON part_types(device_id);

-- 4. Enable RLS on part_types
ALTER TABLE part_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "part_types_select" ON part_types
  FOR SELECT USING (
    business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "part_types_insert" ON part_types
  FOR INSERT WITH CHECK (
    business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "part_types_update" ON part_types
  FOR UPDATE USING (
    business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "part_types_delete" ON part_types
  FOR DELETE USING (
    business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid())
  );
