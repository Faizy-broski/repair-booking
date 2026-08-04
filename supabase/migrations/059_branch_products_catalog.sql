-- Migration 059: Per-branch product catalog
-- Each branch maintains its own product catalog via the branch_products table.
-- A product is only visible in a branch's inventory/POS when there is an enabled
-- branch_products row for that (branch_id, product_id) pair.
--
-- This replaces the old behaviour where ALL branches automatically saw every
-- product created by any branch in the business.

-- ── 1. Create branch_products ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branch_products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   UUID        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  is_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (branch_id, product_id)
);

CREATE INDEX IF NOT EXISTS branch_products_branch_idx   ON branch_products(branch_id);
CREATE INDEX IF NOT EXISTS branch_products_product_idx  ON branch_products(product_id);
CREATE INDEX IF NOT EXISTS branch_products_enabled_idx  ON branch_products(branch_id, is_enabled) WHERE is_enabled = TRUE;

-- RLS: business members can read/write their own branch catalog rows.
ALTER TABLE branch_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_products_business_access" ON branch_products
  USING (
    branch_id IN (
      SELECT id FROM branches
      WHERE business_id = (
        SELECT business_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ── 2. Backfill: for every existing (branch_id, product_id) pair in inventory,
--    create a branch_products row so existing data continues to work.
--    We use ON CONFLICT DO NOTHING so running this migration twice is safe.
INSERT INTO branch_products (branch_id, product_id, is_enabled)
SELECT DISTINCT i.branch_id, i.product_id, TRUE
FROM   inventory i
JOIN   products  p ON p.id = i.product_id
WHERE  p.is_active = TRUE
ON CONFLICT (branch_id, product_id) DO NOTHING;
