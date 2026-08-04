-- Performance indexes for high-frequency query patterns.

-- repairs: composite index for the list query (branch_id + sort columns)
CREATE INDEX IF NOT EXISTS idx_repairs_branch_created
  ON repairs(branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_repairs_branch_status
  ON repairs(branch_id, status);

-- repairs: customer lookup (foreign key scans)
CREATE INDEX IF NOT EXISTS idx_repairs_customer
  ON repairs(customer_id);

-- repairs: search on job_number
CREATE INDEX IF NOT EXISTS idx_repairs_job_number
  ON repairs(job_number);

-- products: composite for the main listing query
CREATE INDEX IF NOT EXISTS idx_products_business_active_name
  ON products(business_id, is_active, name);

CREATE INDEX IF NOT EXISTS idx_products_category
  ON products(category_id);

CREATE INDEX IF NOT EXISTS idx_products_brand
  ON products(brand_id);

CREATE INDEX IF NOT EXISTS idx_products_model
  ON products(model_id);

-- inventory: composite for per-branch stock lookup (the hottest query in POS + inventory pages)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_branch_product_variant
  ON inventory(branch_id, product_id, variant_id);

-- branch_products: used on every product list query that filters by branch catalog
CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_products_branch_product
  ON branch_products(branch_id, product_id);

CREATE INDEX IF NOT EXISTS idx_branch_products_product
  ON branch_products(product_id);

-- customers: business-scoped lookup + phone search
CREATE INDEX IF NOT EXISTS idx_customers_business_phone
  ON customers(business_id, phone);

-- sales: branch + date for reports
CREATE INDEX IF NOT EXISTS idx_sales_branch_created
  ON sales(branch_id, created_at DESC);
