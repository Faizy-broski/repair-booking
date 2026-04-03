-- ============================================================
-- 017 Advanced Inventory
-- Serialized units, valuation methods, stock counts,
-- bundles, trade-ins
-- ============================================================

-- ── 5.1 Serialized Inventory ────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_serials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id           UUID NOT NULL REFERENCES branches(id),
  serial_number       TEXT NOT NULL,
  imei                TEXT,
  status              TEXT NOT NULL DEFAULT 'in_stock'
                        CHECK (status IN ('in_stock','sold','in_repair','returned','damaged')),
  purchase_order_id   UUID REFERENCES purchase_orders(id),
  sale_id             UUID REFERENCES sales(id),
  repair_id           UUID REFERENCES repairs(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, serial_number)
);

-- Add serialized flag to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_serialized BOOLEAN DEFAULT false;

-- ── 5.2 Inventory Valuation ─────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS valuation_method TEXT DEFAULT 'weighted_average'
  CHECK (valuation_method IN ('weighted_average','fifo','lifo'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS average_cost NUMERIC(10,2) DEFAULT 0;

-- FIFO/LIFO cost layers
CREATE TABLE IF NOT EXISTS inventory_cost_layers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id),
  quantity        INT NOT NULL DEFAULT 0,
  unit_cost       NUMERIC(10,2) NOT NULL DEFAULT 0,
  received_at     TIMESTAMPTZ DEFAULT NOW(),
  source_id       UUID,  -- grn_id or adjustment_id
  source_type     TEXT CHECK (source_type IN ('grn','adjustment','trade_in')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5.3 Inventory Count Tool ─────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_counts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  name            TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress','completed','cancelled')),
  started_by      UUID REFERENCES profiles(id),
  notes           TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_count_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id        UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  system_qty      INT NOT NULL DEFAULT 0,
  counted_qty     INT,
  notes           TEXT
);

-- Atomic function: complete inventory count and apply adjustments
CREATE OR REPLACE FUNCTION complete_inventory_count(p_count_id UUID, p_adjusted_by UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_branch_id UUID;
  v_business_id UUID;
  r RECORD;
BEGIN
  SELECT branch_id, business_id INTO v_branch_id, v_business_id
    FROM inventory_counts WHERE id = p_count_id;

  -- Loop over items with variances
  FOR r IN
    SELECT ci.product_id,
           ci.counted_qty,
           ci.system_qty,
           (ci.counted_qty - ci.system_qty) AS variance
      FROM inventory_count_items ci
     WHERE ci.count_id = p_count_id
       AND ci.counted_qty IS NOT NULL
       AND ci.counted_qty != ci.system_qty
  LOOP
    -- Update inventory
    INSERT INTO inventory (product_id, branch_id, quantity, updated_at)
    VALUES (r.product_id, v_branch_id, r.counted_qty, NOW())
    ON CONFLICT (product_id, branch_id)
    DO UPDATE SET quantity = r.counted_qty, updated_at = NOW();

    -- Log stock movement
    INSERT INTO stock_movements (product_id, branch_id, quantity, type, reference_type, notes, created_by)
    VALUES (
      r.product_id, v_branch_id,
      r.variance,
      CASE WHEN r.variance > 0 THEN 'in' ELSE 'out' END,
      'count_adjustment',
      'Inventory count adjustment',
      p_adjusted_by
    );
  END LOOP;

  -- Mark count complete
  UPDATE inventory_counts
     SET status = 'completed', completed_at = NOW()
   WHERE id = p_count_id;
END;
$$;

-- ── 5.4 Product Bundles ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_bundles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id),
  name            TEXT NOT NULL,
  description     TEXT,
  bundle_price    NUMERIC(10,2) NOT NULL DEFAULT 0,
  sku             TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_bundle_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id       UUID NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        INT NOT NULL DEFAULT 1
);

-- ── 5.5 Trade-In ─────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_trade_in BOOLEAN DEFAULT false;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS condition_grade TEXT
  CHECK (condition_grade IN ('A','B','C','D','faulty'));

CREATE TABLE IF NOT EXISTS trade_in_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES businesses(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  customer_id     UUID REFERENCES customers(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  variant_id      UUID REFERENCES product_variants(id),
  trade_in_value  NUMERIC(10,2) NOT NULL DEFAULT 0,
  condition_grade TEXT NOT NULL CHECK (condition_grade IN ('A','B','C','D','faulty')),
  serial_number   TEXT,
  imei            TEXT,
  sale_id         UUID REFERENCES sales(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Function: update average_cost after receiving stock
CREATE OR REPLACE FUNCTION update_average_cost(p_product_id UUID, p_new_qty INT, p_new_cost NUMERIC)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_qty   INT;
  v_current_cost  NUMERIC;
BEGIN
  SELECT COALESCE(SUM(i.quantity), 0) INTO v_current_qty
    FROM inventory i WHERE i.product_id = p_product_id;

  SELECT COALESCE(average_cost, 0) INTO v_current_cost
    FROM products WHERE id = p_product_id;

  IF (v_current_qty + p_new_qty) > 0 THEN
    UPDATE products
       SET average_cost = ((v_current_qty * v_current_cost) + (p_new_qty * p_new_cost))
                           / (v_current_qty + p_new_qty)
     WHERE id = p_product_id;
  END IF;
END;
$$;
