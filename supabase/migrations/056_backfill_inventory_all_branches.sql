-- Migration 056: Backfill inventory rows for all branches
--
-- Problem: products were historically created with an inventory row for only
-- the single active branch at the time.  When a business owner switches to a
-- different branch, those products show on_hand = 0 because no inventory row
-- exists for that branch.
--
-- Fix: for every (branch, product) combination that doesn't already have an
-- inventory row, insert a zero-quantity row so all branches have a tracked
-- stock level.  Existing rows with real quantities are untouched.

INSERT INTO inventory (branch_id, product_id, quantity, low_stock_alert)
SELECT
  b.id   AS branch_id,
  p.id   AS product_id,
  0      AS quantity,
  5      AS low_stock_alert
FROM branches b
JOIN products p ON p.business_id = b.business_id
WHERE
  b.is_active = TRUE
  AND p.is_active = TRUE
  -- Only physial stock items (not pure services)
  AND (p.item_type = 'part' OR p.is_service = FALSE OR p.is_service IS NULL)
  -- Skip combinations that already have an inventory row
  AND NOT EXISTS (
    SELECT 1
    FROM inventory i
    WHERE i.branch_id  = b.id
      AND i.product_id = p.id
      AND i.variant_id IS NULL
  );
