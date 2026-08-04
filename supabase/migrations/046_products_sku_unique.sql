-- ============================================================================
-- 046 — Unique constraint on products(business_id, sku)
-- Required for the bulk-import upsert to work.
-- SKU is per-business so two different businesses can use the same SKU.
-- Only non-NULL SKUs are constrained (NULL means no SKU assigned).
--
-- Strategy for existing duplicate SKUs:
--   NEVER delete products — they may be referenced by sale_items, repairs, etc.
--   Instead, nullify the SKU on older duplicates so the unique index can be
--   created without data loss.  The newest product keeps the SKU.
-- ============================================================================

-- For each (business_id, sku) group with duplicates, set sku = NULL on all
-- rows EXCEPT the most-recently created one.  NULL is excluded from the
-- partial unique index so these rows are no longer in conflict.
UPDATE products
SET    sku = NULL
WHERE  sku IS NOT NULL
  AND  id NOT IN (
    SELECT DISTINCT ON (business_id, sku) id
    FROM   products
    WHERE  sku IS NOT NULL
    ORDER  BY business_id, sku, created_at DESC
  );

-- Partial unique index — NULLs are excluded so rows without a SKU are unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_business_sku
  ON products(business_id, sku)
  WHERE sku IS NOT NULL;
