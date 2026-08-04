-- Migration 161: Link buyback cash-out movements to the product they created.
--
-- record_cash_movement() (migration 133) already creates a `products` row for a
-- Buyback cash-out, but never stored that product's id back on the cash_movements
-- row — it only returned it in the RPC's JSON response, which nothing persisted.
-- So there was no way to look up "which product was this buyback for" later
-- (e.g. from the Sales page's Cash Out detail view).
--
-- This adds a product_id column to cash_movements, updates record_cash_movement
-- to populate it for future buybacks, and best-effort backfills existing buyback
-- rows by matching the trade-in product it created (same branch, same amount as
-- that product's cost_price, created within a few minutes of the movement —
-- these are the exact values record_cash_movement always sets together).

ALTER TABLE cash_movements
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);

CREATE INDEX IF NOT EXISTS idx_cash_movements_product ON cash_movements(product_id) WHERE product_id IS NOT NULL;

-- ── 1. Update record_cash_movement to persist product_id going forward ─────────

CREATE OR REPLACE FUNCTION record_cash_movement(
  p_session_id             UUID,
  p_branch_id               UUID,
  p_business_id             UUID,
  p_cashier_id              UUID,
  p_type                    TEXT,
  p_amount                  NUMERIC,
  p_payment_type            TEXT DEFAULT 'cash',
  p_notes                   TEXT DEFAULT NULL,
  p_purpose                 TEXT DEFAULT 'plain',
  p_expense_category_id     UUID DEFAULT NULL,
  p_expense_title           TEXT DEFAULT NULL,
  p_buyback_product_id      UUID DEFAULT NULL,
  p_buyback_name            TEXT DEFAULT NULL,
  p_buyback_selling_price   NUMERIC DEFAULT NULL,
  p_buyback_barcode         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_movement_id UUID;
  v_product_id  UUID;
  v_barcode     TEXT;
  v_inv_id      UUID;
  v_inv_qty     INT;
BEGIN
  INSERT INTO cash_movements (session_id, branch_id, business_id, cashier_id, type, amount, payment_type, notes, purpose)
  VALUES (p_session_id, p_branch_id, p_business_id, p_cashier_id, p_type, p_amount, p_payment_type, p_notes, p_purpose)
  RETURNING id INTO v_movement_id;

  IF p_type = 'cash_out' AND p_purpose = 'expense' THEN
    INSERT INTO expenses (branch_id, category_id, title, amount, expense_date, notes)
    VALUES (p_branch_id, p_expense_category_id, COALESCE(NULLIF(p_expense_title, ''), 'POS Cash Out'), p_amount, CURRENT_DATE, p_notes);
  END IF;

  IF p_type = 'cash_out' AND p_purpose = 'buyback' THEN
    v_product_id := p_buyback_product_id;

    IF v_product_id IS NULL THEN
      v_barcode := NULLIF(p_buyback_barcode, '');
      IF v_barcode IS NULL THEN
        v_barcode := floor(100000000000 + random() * 900000000000)::bigint::text;
      END IF;

      INSERT INTO products (business_id, name, selling_price, cost_price, barcode, item_type, is_trade_in)
      VALUES (p_business_id, p_buyback_name, p_buyback_selling_price, p_amount, v_barcode, 'product', true)
      RETURNING id INTO v_product_id;

      INSERT INTO branch_products (branch_id, product_id, is_enabled)
      VALUES (p_branch_id, v_product_id, true)
      ON CONFLICT (branch_id, product_id) DO UPDATE SET is_enabled = true;
    END IF;

    SELECT id, quantity INTO v_inv_id, v_inv_qty
    FROM inventory
    WHERE branch_id = p_branch_id AND product_id = v_product_id AND variant_id IS NULL;

    IF v_inv_id IS NOT NULL THEN
      UPDATE inventory SET quantity = v_inv_qty + 1, updated_at = NOW() WHERE id = v_inv_id;
    ELSE
      INSERT INTO inventory (branch_id, product_id, quantity, low_stock_alert)
      VALUES (p_branch_id, v_product_id, 1, 5);
    END IF;

    INSERT INTO stock_movements (branch_id, product_id, type, quantity, note)
    VALUES (p_branch_id, v_product_id, 'trade_in', 1, 'Buyback from customer');

    UPDATE cash_movements SET product_id = v_product_id WHERE id = v_movement_id;
  END IF;

  RETURN jsonb_build_object('id', v_movement_id, 'product_id', v_product_id);
END;
$$;

-- ── 2. Best-effort backfill for buyback movements recorded before this migration ──
-- Matches each unlinked buyback movement to the trade-in product record_cash_movement
-- created for it: same branch, cost_price = movement amount, is_trade_in = true,
-- product created within 10 minutes of the movement. Picks the closest-in-time
-- candidate per movement so two same-amount buybacks in one session don't collide.

WITH candidates AS (
  SELECT
    cm.id AS movement_id,
    p.id AS product_id,
    ROW_NUMBER() OVER (
      PARTITION BY cm.id
      ORDER BY ABS(EXTRACT(EPOCH FROM (p.created_at - cm.created_at)))
    ) AS rn
  FROM cash_movements cm
  JOIN branch_products bp ON bp.branch_id = cm.branch_id
  JOIN products p ON p.id = bp.product_id
  WHERE cm.type = 'cash_out'
    AND cm.purpose = 'buyback'
    AND cm.product_id IS NULL
    AND p.is_trade_in = true
    AND p.cost_price = cm.amount
    AND p.created_at BETWEEN cm.created_at - INTERVAL '10 minutes' AND cm.created_at + INTERVAL '10 minutes'
)
UPDATE cash_movements cm
SET product_id = c.product_id
FROM candidates c
WHERE c.movement_id = cm.id AND c.rn = 1;
