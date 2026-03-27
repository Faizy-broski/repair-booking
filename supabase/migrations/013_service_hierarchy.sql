-- ============================================================
-- 013_service_hierarchy.sql
-- 5-Level Service Hierarchy: Category → Manufacturer → Device → Problem → Parts
-- ============================================================

-- Level 1 — Service Categories (e.g. "Mobile Phones", "Laptops", "Watches")
CREATE TABLE service_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  parent_id     UUID REFERENCES service_categories(id),
  image_url     TEXT,
  retail_margin NUMERIC(5,2) DEFAULT 0,
  show_on_pos   BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, slug)
);

CREATE INDEX idx_svc_categories_business ON service_categories(business_id);
CREATE INDEX idx_svc_categories_parent   ON service_categories(parent_id);

-- Level 2 — Manufacturers (e.g. "Apple", "Samsung", "Google")
CREATE TABLE service_manufacturers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, name)
);

CREATE INDEX idx_svc_manufacturers_business ON service_manufacturers(business_id);

-- Level 3 — Devices (e.g. "iPhone 15 Pro", "Galaxy S24")
CREATE TABLE service_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  manufacturer_id UUID NOT NULL REFERENCES service_manufacturers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  image_url       TEXT,
  colors          JSONB DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_svc_devices_business      ON service_devices(business_id);
CREATE INDEX idx_svc_devices_manufacturer  ON service_devices(manufacturer_id);

-- Level 4 — Problems / Services (e.g. "Screen Replacement", "Battery Swap")
CREATE TABLE service_problems (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id        UUID REFERENCES service_categories(id),
  device_id          UUID REFERENCES service_devices(id),
  name               TEXT NOT NULL,
  price              NUMERIC(10,2) DEFAULT 0,
  cost               NUMERIC(10,2) DEFAULT 0,
  warranty_days      INT DEFAULT 0,
  tax_class          TEXT,
  show_on_pos        BOOLEAN DEFAULT true,
  show_on_portal     BOOLEAN DEFAULT true,
  use_for_all_models BOOLEAN DEFAULT false,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_svc_problems_business  ON service_problems(business_id);
CREATE INDEX idx_svc_problems_category  ON service_problems(category_id);
CREATE INDEX idx_svc_problems_device    ON service_problems(device_id);

-- Level 5 — Problem Parts (links service_problems → products/inventory)
CREATE TABLE service_problem_parts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id           UUID NOT NULL REFERENCES service_problems(id) ON DELETE CASCADE,
  product_id           UUID NOT NULL REFERENCES products(id),
  default_qty          INT DEFAULT 1,
  default_warranty_days INT DEFAULT 0,
  part_status          TEXT DEFAULT 'used' CHECK (part_status IN ('used','faulty','broken')),
  tax_class            TEXT,
  supplier_id          UUID,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_svc_problem_parts_problem  ON service_problem_parts(problem_id);
CREATE INDEX idx_svc_problem_parts_product  ON service_problem_parts(product_id);

-- Link repair_items to the service hierarchy problem
ALTER TABLE repair_items ADD COLUMN IF NOT EXISTS problem_id UUID REFERENCES service_problems(id);
