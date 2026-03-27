-- ============================================================
-- 016_supply_chain.sql
-- Phase 4: Suppliers, Purchase Orders, GRN, Special Orders
-- ============================================================

-- ── Suppliers ────────────────────────────────────────────────────────────────

CREATE TABLE suppliers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  contact_person    TEXT,
  email             TEXT,
  phone             TEXT,
  mobile            TEXT,
  address           TEXT,
  city              TEXT,
  country           TEXT,
  tax_id            TEXT,
  payment_terms_days INT DEFAULT 30,
  currency          TEXT DEFAULT 'GBP',
  notes             TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_suppliers_business ON suppliers(business_id);

-- ── Purchase Orders ──────────────────────────────────────────────────────────

CREATE TABLE purchase_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id             UUID NOT NULL REFERENCES branches(id),
  supplier_id           UUID NOT NULL REFERENCES suppliers(id),
  po_number             TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','pending','in_progress','received','cancelled')),
  expected_delivery_date DATE,
  notes                 TEXT,
  subtotal              NUMERIC(10,2) DEFAULT 0,
  tax                   NUMERIC(10,2) DEFAULT 0,
  total                 NUMERIC(10,2) DEFAULT 0,
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, po_number)
);

CREATE TABLE purchase_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id             UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES products(id),
  name              TEXT NOT NULL,
  sku               TEXT,
  quantity_ordered  INT NOT NULL DEFAULT 1,
  quantity_received INT NOT NULL DEFAULT 0,
  unit_cost         NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_class         TEXT
);

CREATE INDEX idx_po_business    ON purchase_orders(business_id);
CREATE INDEX idx_po_branch      ON purchase_orders(branch_id);
CREATE INDEX idx_po_supplier    ON purchase_orders(supplier_id);
CREATE INDEX idx_po_items_po    ON purchase_order_items(po_id);

-- PO number generator
CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_po_number(p_branch_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_seq  BIGINT;
  v_prefix TEXT;
BEGIN
  SELECT UPPER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'), 3))
  INTO v_prefix
  FROM branches WHERE id = p_branch_id;

  v_seq := nextval('po_number_seq');
  RETURN 'PO-' || COALESCE(v_prefix, 'STR') || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$;

-- ── Goods Receiving Notes ────────────────────────────────────────────────────

CREATE TABLE goods_receiving_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id       UUID NOT NULL REFERENCES purchase_orders(id),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id),
  received_by UUID REFERENCES profiles(id),
  notes       TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE grn_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id            UUID NOT NULL REFERENCES goods_receiving_notes(id) ON DELETE CASCADE,
  po_item_id        UUID NOT NULL REFERENCES purchase_order_items(id),
  quantity_received INT NOT NULL DEFAULT 0,
  notes             TEXT
);

CREATE INDEX idx_grn_po         ON goods_receiving_notes(po_id);
CREATE INDEX idx_grn_items_grn  ON grn_items(grn_id);

-- Atomic GRN processing function
-- Updates po_item.quantity_received, increments inventory, logs stock_movements, updates PO status
CREATE OR REPLACE FUNCTION process_grn(p_grn_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_grn   goods_receiving_notes%ROWTYPE;
  v_item  grn_items%ROWTYPE;
  v_poi   purchase_order_items%ROWTYPE;
  v_total_ordered  INT;
  v_total_received INT;
BEGIN
  SELECT * INTO v_grn FROM goods_receiving_notes WHERE id = p_grn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRN not found'; END IF;

  FOR v_item IN SELECT * FROM grn_items WHERE grn_id = p_grn_id LOOP
    SELECT * INTO v_poi FROM purchase_order_items WHERE id = v_item.po_item_id;

    -- Update received qty on PO item
    UPDATE purchase_order_items
    SET quantity_received = quantity_received + v_item.quantity_received
    WHERE id = v_item.po_item_id;

    -- Increment inventory (upsert)
    IF v_poi.product_id IS NOT NULL THEN
      INSERT INTO inventory(branch_id, product_id, quantity, low_stock_alert)
      VALUES (v_grn.branch_id, v_poi.product_id, v_item.quantity_received, 5)
      ON CONFLICT (branch_id, product_id)
        DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity;

      -- Log stock movement
      INSERT INTO stock_movements(branch_id, product_id, type, quantity, reference_id, note, created_by)
      VALUES (v_grn.branch_id, v_poi.product_id, 'purchase', v_item.quantity_received, p_grn_id, 'GRN receipt', p_user_id);
    END IF;
  END LOOP;

  -- Update PO status
  SELECT SUM(quantity_ordered), SUM(quantity_received)
  INTO v_total_ordered, v_total_received
  FROM purchase_order_items
  WHERE po_id = v_grn.po_id;

  UPDATE purchase_orders
  SET status = CASE
    WHEN v_total_received >= v_total_ordered THEN 'received'
    WHEN v_total_received > 0               THEN 'in_progress'
    ELSE status
  END,
  updated_at = NOW()
  WHERE id = v_grn.po_id;
END;
$$;

-- ── Special Orders ───────────────────────────────────────────────────────────

CREATE TABLE special_orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id),
  repair_id   UUID REFERENCES repairs(id),
  customer_id UUID REFERENCES customers(id),
  product_id  UUID REFERENCES products(id),
  name        TEXT NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  unit_cost   NUMERIC(10,2) DEFAULT 0,
  tracking_id TEXT,
  po_id       UUID REFERENCES purchase_orders(id),
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','ordered','received','linked')),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_special_orders_business ON special_orders(business_id);
CREATE INDEX idx_special_orders_repair   ON special_orders(repair_id);
