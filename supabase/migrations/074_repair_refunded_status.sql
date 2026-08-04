-- ============================================================
-- 074_repair_refunded_status.sql
-- Adds "refunded" as a system custom status for all businesses
-- that don't already have it, and adds refund tracking column.
-- ============================================================

-- 1. Add refund_amount column to repairs (stores how much was refunded back)
ALTER TABLE repairs
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 2. Seed "refunded" status for every business that doesn't have it yet
INSERT INTO repair_custom_statuses (business_id, name, color, sort_order)
SELECT b.id, 'refunded', '#ef4444', 999
FROM businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM repair_custom_statuses rcs
  WHERE rcs.business_id = b.id
    AND LOWER(rcs.name) = 'refunded'
);
