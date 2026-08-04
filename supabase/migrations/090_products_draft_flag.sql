-- ============================================================================
-- 090 — Draft product flag + atomic duplicate_product() function
--
-- Adds is_draft to products (default FALSE — fully backward compatible,
-- every existing row backfills to FALSE with no table rewrite).
-- Drafts are excluded from product listings by default (POS, scanner, stats)
-- and only become visible for sale once the user saves the duplicated
-- product via the edit page (which explicitly clears is_draft).
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_is_draft
  ON products(business_id, is_draft)
  WHERE is_draft = TRUE;

-- ── duplicate_product() ─────────────────────────────────────────────────────
-- Atomically copies a product (and its variants, if any) into a new draft
-- row, and enables it in the calling branch's catalog. All-or-nothing —
-- if any step fails, the whole operation rolls back and no partial draft
-- is left behind.
CREATE OR REPLACE FUNCTION duplicate_product(
  p_product_id UUID,
  p_business_id UUID,
  p_branch_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_new_id UUID;
  v_has_variants BOOLEAN;
  v_suffix TEXT := substr(md5(random()::text), 1, 4);
BEGIN
  SELECT has_variants INTO v_has_variants
  FROM products WHERE id = p_product_id AND business_id = p_business_id;

  IF v_has_variants IS NULL THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  INSERT INTO products (
    business_id, category_id, brand_id, name, description, sku, barcode,
    cost_price, selling_price, image_url, has_variants, is_service, is_active, is_draft,
    custom_fields, condition, physical_location, warranty_days, imei,
    retail_markup, promotional_price, promotion_start, promotion_end, minimum_price, online_price,
    commission_enabled, commission_type, commission_rate, loyalty_enabled,
    reorder_level, supplier_id, model_id, track_inventory, item_type, part_type
  )
  SELECT
    business_id, category_id, brand_id, name || ' (Copy - ' || v_suffix || ')', description,
    NULL,                                                  -- sku: blank, avoids unique index collision
    floor(random() * 900000000000 + 100000000000)::text,   -- barcode: fresh, same scheme as ProductService.create
    cost_price, selling_price, image_url, has_variants, is_service, TRUE, TRUE,  -- is_active, is_draft
    custom_fields, condition, physical_location, warranty_days, imei,
    retail_markup, promotional_price, promotion_start, promotion_end, minimum_price, online_price,
    commission_enabled, commission_type, commission_rate, loyalty_enabled,
    reorder_level, supplier_id, model_id, track_inventory, item_type, part_type
  FROM products
  WHERE id = p_product_id AND business_id = p_business_id
  RETURNING id INTO v_new_id;

  IF v_has_variants THEN
    INSERT INTO product_variants (product_id, name, sku, barcode, cost_price, selling_price, attributes, condition_grade)
    SELECT v_new_id, name, NULL, floor(random() * 900000000000 + 100000000000)::text,
           cost_price, selling_price, attributes, condition_grade
    FROM product_variants WHERE product_id = p_product_id;
  END IF;

  IF p_branch_id IS NOT NULL THEN
    INSERT INTO branch_products (branch_id, product_id, is_enabled)
    VALUES (p_branch_id, v_new_id, TRUE)
    ON CONFLICT (branch_id, product_id) DO UPDATE SET is_enabled = TRUE;
  END IF;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;
