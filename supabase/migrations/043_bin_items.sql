-- ── Bin feature — 100% loss write-offs ──────────────────────────────────────
-- Moving an inventory item to the Bin removes its quantity from active
-- inventory (visible stock/valuation) and records it here as a full loss,
-- separate from ordinary stock adjustments. Items can be restored back into
-- inventory if binned by mistake — restoring keeps the row (status flips to
-- 'restored') rather than deleting it, so the Bin page also doubles as an
-- audit trail of past write-offs.

CREATE TABLE IF NOT EXISTS bin_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_id    UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sku           TEXT,
  quantity      INT NOT NULL CHECK (quantity > 0),
  unit_cost     NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'binned' CHECK (status IN ('binned','restored')),
  binned_by     UUID REFERENCES profiles(id),
  binned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restored_by   UUID REFERENCES profiles(id),
  restored_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bin_items_branch  ON bin_items(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_bin_items_product ON bin_items(product_id);
