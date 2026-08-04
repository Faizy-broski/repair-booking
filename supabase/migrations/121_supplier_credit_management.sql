-- Migration 121: Supplier Credit Management (accounts payable)
--
-- purchase_orders (migration 016) has no payment tracking at all — a PO is
-- purely a stock-receiving workflow today. This adds the supplier-side
-- mirror of the Customer Credit system (migration 120's sale_payments):
-- a purchase order becomes a real payable once it's actually received
-- (status = 'received'), and supplier_payments is the dated ledger of
-- payments made against it, same shape as sale_payments.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','partial','paid'));

CREATE TABLE IF NOT EXISTS supplier_payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id        UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id        UUID NOT NULL REFERENCES suppliers(id),
  purchase_order_id  UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  amount             NUMERIC(10,2) NOT NULL,
  method             TEXT NOT NULL,
  note               TEXT,
  created_by         UUID REFERENCES profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_po       ON supplier_payments(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_business ON supplier_payments(business_id);

-- Records a payment against a received PO. Nothing is owed before goods are
-- actually received, so this deliberately rejects draft/pending/cancelled POs.
CREATE OR REPLACE FUNCTION record_supplier_payment(
  p_po_id       UUID,
  p_amount      NUMERIC,
  p_method      TEXT,
  p_note        TEXT DEFAULT NULL,
  p_business_id UUID DEFAULT NULL,
  p_created_by  UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_total       NUMERIC;
  v_paid        NUMERIC;
  v_new_paid    NUMERIC;
  v_new_status  TEXT;
  v_supplier_id UUID;
BEGIN
  SELECT total, amount_paid, supplier_id
  INTO v_total, v_paid, v_supplier_id
  FROM purchase_orders
  WHERE id = p_po_id
    AND status = 'received'
    AND payment_status != 'paid'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found, not yet received, or already fully paid';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  v_new_paid := v_paid + p_amount;

  IF v_new_paid > v_total + 0.01 THEN
    RAISE EXCEPTION 'Payment of % exceeds outstanding balance of %', p_amount, (v_total - v_paid);
  END IF;

  v_new_paid := LEAST(v_new_paid, v_total);

  IF v_new_paid >= v_total THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partial';
  END IF;

  UPDATE purchase_orders
  SET amount_paid = v_new_paid,
      payment_status = v_new_status,
      updated_at = NOW()
  WHERE id = p_po_id;

  INSERT INTO supplier_payments (business_id, supplier_id, purchase_order_id, amount, method, note, created_by)
  VALUES (
    COALESCE(p_business_id, (SELECT business_id FROM purchase_orders WHERE id = p_po_id)),
    v_supplier_id, p_po_id, p_amount, p_method, p_note, p_created_by
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RLS (business-scoped, same shape as `suppliers` — 018_supply_chain_rls.sql) ──
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_supplier_payments" ON supplier_payments
  FOR ALL TO authenticated
  USING (business_id = public.user_business_id() AND public.is_owner_or_manager());

CREATE POLICY "staff_reads_supplier_payments" ON supplier_payments
  FOR SELECT TO authenticated
  USING (business_id = public.user_business_id());
