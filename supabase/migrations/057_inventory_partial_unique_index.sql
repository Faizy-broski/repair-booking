-- Migration 057: Fix inventory unique constraints for base-product rows
--
-- Problem: The original UNIQUE(branch_id, product_id, variant_id) constraint
-- does NOT prevent duplicate base-product rows (variant_id IS NULL) because
-- PostgreSQL treats NULL as distinct from every other NULL in unique constraints.
-- So two rows with (branchA, productP, NULL) are both "unique" and can co-exist.
--
-- This causes two bugs:
--   1. The upsert `ON CONFLICT(branch_id, product_id)` targets a non-existent
--      2-column unique constraint → fails silently → no inventory rows created.
--   2. If duplicate base rows exist (e.g. after the backfill migration), the
--      `inventory!left` join returns multiple rows for the same branch/product
--      and `.find()` may return a qty=0 duplicate instead of the real qty row.
--
-- Fix:
--   a) Add a partial unique index covering base-product rows (variant_id IS NULL)
--      so that ON CONFLICT(branch_id, product_id) works correctly for those rows.
--   b) Remove duplicate base-product rows, keeping the row with the highest
--      quantity per (branch_id, product_id).
--   c) The 3-column constraint already handles variant rows correctly (variant_id
--      IS NOT NULL → NULLs don't appear → constraint works as expected).

-- Step 1: Remove duplicate base-product inventory rows, keeping the highest qty.
DELETE FROM inventory
WHERE id NOT IN (
  SELECT DISTINCT ON (branch_id, product_id)
    id
  FROM inventory
  WHERE variant_id IS NULL
  ORDER BY branch_id, product_id, quantity DESC, updated_at DESC
)
AND variant_id IS NULL;

-- Step 2: Add a partial unique index to enforce one base row per (branch, product).
-- This also enables ON CONFLICT(branch_id, product_id) in upsert calls for base rows.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_branch_product_base_idx
  ON inventory (branch_id, product_id)
  WHERE variant_id IS NULL;
