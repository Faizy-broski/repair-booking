-- ── Supplier Damage Returns ──────────────────────────────────────────────────
-- Tracks damaged stock being returned to a supplier, whether or not it
-- originated from a tracked Purchase Order. A return starts as a 'draft' (no
-- inventory effect yet, so items can be added/removed freely). Marking it
-- 'shipped' is the point of no return for inventory: it atomically decrements
-- on-hand quantity for every line item and logs a stock_movements row, mirroring
-- how the Bin feature removes stock. 'resolved' records what the supplier gave
-- back for the damaged goods (replacement / credit / refund); a credit or
-- refund tied to a Purchase Order is also posted through the existing
-- record_supplier_payment RPC so it shows up in supplier statements.

CREATE TABLE IF NOT EXISTS supplier_returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id         UUID NOT NULL REFERENCES branches(id),
  supplier_id       UUID NOT NULL REFERENCES suppliers(id),
  po_id             UUID REFERENCES purchase_orders(id),
  return_number     TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','shipped','resolved','cancelled')),
  resolution_type   TEXT CHECK (resolution_type IN ('replacement','credit','refund')),
  resolution_amount NUMERIC(10,2),
  resolution_note   TEXT,
  notes             TEXT,
  total_value       NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES profiles(id),
  shipped_by        UUID REFERENCES profiles(id),
  shipped_at        TIMESTAMPTZ,
  resolved_by       UUID REFERENCES profiles(id),
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, return_number)
);

CREATE TABLE IF NOT EXISTS supplier_return_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id      UUID NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
  product_id     UUID REFERENCES products(id),
  variant_id     UUID REFERENCES product_variants(id),
  po_item_id     UUID REFERENCES purchase_order_items(id),
  name           TEXT NOT NULL,
  sku            TEXT,
  quantity       INT NOT NULL CHECK (quantity > 0),
  unit_cost      NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason         TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_returns_business  ON supplier_returns(business_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_branch    ON supplier_returns(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier  ON supplier_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_po        ON supplier_returns(po_id);
CREATE INDEX IF NOT EXISTS idx_supplier_return_items_ret  ON supplier_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_supplier_return_items_poi  ON supplier_return_items(po_item_id);

-- Return number generator (mirrors generate_po_number)
CREATE SEQUENCE IF NOT EXISTS supplier_return_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_supplier_return_number(p_branch_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_seq    BIGINT;
  v_prefix TEXT;
BEGIN
  SELECT UPPER(LEFT(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'), 3))
  INTO v_prefix
  FROM branches WHERE id = p_branch_id;

  v_seq := nextval('supplier_return_number_seq');
  RETURN 'SR-' || COALESCE(v_prefix, 'STR') || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$;

-- Atomic "ship to supplier" — decrements inventory and logs a stock movement
-- for every line item, then flips the return to 'shipped'.
--
-- The status flip happens FIRST, as a single conditional UPDATE ... WHERE
-- status = 'draft'. That statement is what Postgres actually serializes on:
-- if two requests (double-click, retry, two tabs) call this for the same
-- return concurrently, only one can ever match status = 'draft' and proceed
-- to touch inventory — the other gets zero rows back and raises immediately,
-- before doing anything. Checking status via a plain SELECT first (like a
-- naive read-then-write) would NOT be safe here: both callers could read
-- 'draft' before either commits its own status update, and both would then
-- decrement inventory for the same return.
--
-- Each line item's decrement is likewise a single
-- `UPDATE inventory SET quantity = quantity - X WHERE ... AND quantity >= X`
-- rather than "SELECT quantity, check in application code, then UPDATE" — the
-- former is atomic against every other writer of that inventory row (sales,
-- GRN, Bin, another return), not just other calls to this function, because
-- Postgres locks the row and re-evaluates the WHERE clause against the
-- current committed value once the lock is granted. If the whole function
-- raises partway through, Postgres rolls back everything it already did in
-- this call, including the earlier status flip — the return reverts to
-- 'draft' rather than being left half-shipped.
CREATE OR REPLACE FUNCTION ship_supplier_return(p_return_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_branch_id     UUID;
  v_return_number TEXT;
  v_item          supplier_return_items%ROWTYPE;
  v_new_qty       INT;
BEGIN
  UPDATE supplier_returns
  SET status = 'shipped', shipped_by = p_user_id, shipped_at = NOW(), updated_at = NOW()
  WHERE id = p_return_id AND status = 'draft'
  RETURNING branch_id, return_number INTO v_branch_id, v_return_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return not found, or is not a draft (it may have already been shipped/cancelled)';
  END IF;

  FOR v_item IN SELECT * FROM supplier_return_items WHERE return_id = p_return_id LOOP
    IF v_item.product_id IS NULL THEN CONTINUE; END IF;

    UPDATE inventory
    SET quantity = quantity - v_item.quantity, updated_at = NOW()
    WHERE branch_id = v_branch_id AND product_id = v_item.product_id
      AND (variant_id = v_item.variant_id OR (variant_id IS NULL AND v_item.variant_id IS NULL))
      AND quantity >= v_item.quantity
    RETURNING quantity INTO v_new_qty;

    IF NOT FOUND THEN
      SELECT quantity INTO v_new_qty FROM inventory
      WHERE branch_id = v_branch_id AND product_id = v_item.product_id
        AND (variant_id = v_item.variant_id OR (variant_id IS NULL AND v_item.variant_id IS NULL));
      RAISE EXCEPTION 'Only % unit(s) of "%" available — cannot ship % to the supplier.', COALESCE(v_new_qty, 0), v_item.name, v_item.quantity;
    END IF;

    INSERT INTO stock_movements(branch_id, product_id, variant_id, type, quantity, reference_id, note, created_by)
    VALUES (v_branch_id, v_item.product_id, v_item.variant_id, 'return', -v_item.quantity, p_return_id,
            'Returned to supplier: ' || v_return_number, p_user_id);
  END LOOP;
END;
$$;

-- Reverses a shipped return's inventory effect (e.g. shipment was cancelled
-- before the supplier collected it). Draft returns have no inventory effect
-- to reverse, so cancelling those is a plain status update in the service.
-- Same "guarded status flip first" shape as ship_supplier_return, for the
-- same reason: it's the one statement that must serialize concurrent calls.
CREATE OR REPLACE FUNCTION cancel_shipped_supplier_return(p_return_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_branch_id     UUID;
  v_return_number TEXT;
  v_item          supplier_return_items%ROWTYPE;
  v_inv_id        UUID;
BEGIN
  UPDATE supplier_returns
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_return_id AND status = 'shipped'
  RETURNING branch_id, return_number INTO v_branch_id, v_return_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return not found, or is not currently shipped';
  END IF;

  FOR v_item IN SELECT * FROM supplier_return_items WHERE return_id = p_return_id LOOP
    IF v_item.product_id IS NULL THEN CONTINUE; END IF;

    -- Advisory lock scoped to this exact inventory line, held for the rest of
    -- this transaction. Guards the "no row found, so INSERT a new one" branch
    -- below — without it, two concurrent cancels touching the same
    -- branch+product+variant that both find no existing row could both try to
    -- insert one, regardless of what unique constraint (if any) inventory
    -- actually has today.
    PERFORM pg_advisory_xact_lock(hashtextextended(
      v_branch_id::text || ':' || v_item.product_id::text || ':' || COALESCE(v_item.variant_id::text, 'null'), 0));

    UPDATE inventory
    SET quantity = quantity + v_item.quantity, updated_at = NOW()
    WHERE branch_id = v_branch_id AND product_id = v_item.product_id
      AND (variant_id = v_item.variant_id OR (variant_id IS NULL AND v_item.variant_id IS NULL))
    RETURNING id INTO v_inv_id;

    IF NOT FOUND THEN
      INSERT INTO inventory(branch_id, product_id, variant_id, quantity)
      VALUES (v_branch_id, v_item.product_id, v_item.variant_id, v_item.quantity);
    END IF;

    INSERT INTO stock_movements(branch_id, product_id, variant_id, type, quantity, reference_id, note, created_by)
    VALUES (v_branch_id, v_item.product_id, v_item.variant_id, 'return', v_item.quantity, p_return_id,
            'Supplier return cancelled: ' || v_return_number, p_user_id);
  END LOOP;
END;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_supplier_returns" ON supplier_returns
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_supplier_returns" ON supplier_returns
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

ALTER TABLE supplier_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_supplier_return_items" ON supplier_return_items
  FOR ALL TO authenticated
  USING (
    return_id IN (
      SELECT id FROM supplier_returns
      WHERE branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    )
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_supplier_return_items" ON supplier_return_items
  FOR ALL TO authenticated
  USING (
    return_id IN (SELECT id FROM supplier_returns WHERE branch_id = public.user_branch_id())
  );
