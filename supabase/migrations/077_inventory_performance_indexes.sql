-- Migration 077: Additional inventory indexes not in 073
-- 073 already has: idx_products_business_active_name, idx_products_category, idx_products_brand,
--                  idx_products_model, idx_inventory_branch_product_variant (UNIQUE),
--                  idx_branch_products_branch_product (UNIQUE), idx_branch_products_product

-- Business-scoped filter indexes (supersede the non-scoped ones from 073)
CREATE INDEX IF NOT EXISTS idx_products_business_category
  ON products(business_id, category_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_business_brand
  ON products(business_id, brand_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_business_supplier
  ON products(business_id, supplier_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_business_item_type
  ON products(business_id, item_type) WHERE is_active = true;

-- branch_products: covers the is_enabled filter in the inner join
CREATE INDEX IF NOT EXISTS idx_branch_products_branch_enabled
  ON branch_products(branch_id, is_enabled);

-- inventory: partial index for stats query (WHERE variant_id IS NULL)
-- The UNIQUE idx_inventory_branch_product_variant from 073 covers joins,
-- but this partial index is faster for the branch-level stock aggregation
CREATE INDEX IF NOT EXISTS idx_inventory_branch_variant_null
  ON inventory(branch_id, product_id) WHERE variant_id IS NULL;

-- Reference tables (scoped by business for faster dropdown loads)
CREATE INDEX IF NOT EXISTS idx_categories_business
  ON categories(business_id);

CREATE INDEX IF NOT EXISTS idx_brands_business
  ON brands(business_id);

CREATE INDEX IF NOT EXISTS idx_suppliers_business
  ON suppliers(business_id);
