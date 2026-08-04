-- ============================================================================
-- 091 — Per-variant product image
-- Each variant (e.g. color/storage option) can have its own image, distinct
-- from the parent product's image_url. Nullable, backward compatible —
-- existing variants simply have no image until the user sets one.
-- ============================================================================

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS image_url TEXT;
