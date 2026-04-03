-- Extended product fields matching RepairDesk inventory management
-- Additional Details, Pricing & Tax, Stock configuration

-- Additional Details fields
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS condition          TEXT,
  ADD COLUMN IF NOT EXISTS physical_location  TEXT,
  ADD COLUMN IF NOT EXISTS warranty_days      INT NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS imei              TEXT;

-- Extended Pricing & Tax
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS retail_markup      NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promotional_price  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS promotion_start    DATE,
  ADD COLUMN IF NOT EXISTS promotion_end      DATE,
  ADD COLUMN IF NOT EXISTS minimum_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS online_price       NUMERIC(10,2) NOT NULL DEFAULT 0;

-- Commission / Loyalty per product
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS commission_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commission_type    TEXT NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS commission_rate    NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_enabled    BOOLEAN NOT NULL DEFAULT true;

-- Stock extras
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS reorder_level      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_id        UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS model_id           UUID REFERENCES service_devices(id) ON DELETE SET NULL;

-- Manage inventory toggle (default true = tracked)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS track_inventory    BOOLEAN NOT NULL DEFAULT true;

-- ── Product Group Pricing ────────────────────────────────────────────────────
-- Per-customer-group price override per product

CREATE TABLE IF NOT EXISTS product_group_pricing (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_group_id UUID NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
  price             NUMERIC(10,2) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, customer_group_id)
);

ALTER TABLE product_group_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_group_pricing_business"
  ON product_group_pricing FOR ALL
  USING (product_id IN (
    SELECT id FROM products WHERE business_id IN (
      SELECT business_id FROM profiles WHERE id = auth.uid()
    )
  ));

-- ── Product History (lightweight audit log) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS product_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id),
  actor_id    UUID REFERENCES profiles(id),
  actor_name  TEXT,
  action      TEXT NOT NULL CHECK (action IN ('create','update','delete')),
  category    TEXT NOT NULL DEFAULT 'product_information'
              CHECK (category IN ('product_information','stock','pricing_tax','settings','sales','purchases')),
  description TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_history_product_idx ON product_history(product_id, created_at DESC);

ALTER TABLE product_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "product_history_business"
  ON product_history FOR ALL
  USING (business_id IN (
    SELECT business_id FROM profiles WHERE id = auth.uid()
  ));
