-- ============================================================================
-- 181 — Trigram index for products search
-- The parts-search dropdown (and product search generally) filters with
-- `name/sku/barcode/imei ILIKE '%term%'` (product.service.ts) — a leading
-- wildcard that the existing plain btree index on (business_id, is_active,
-- name) (073_performance_indexes.sql) cannot use. Same pattern already used
-- for businesses.name (109) and vehicles.registration_number (174).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_products_name_trgm    ON products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm     ON products USING gin (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm ON products USING gin (barcode gin_trgm_ops);
