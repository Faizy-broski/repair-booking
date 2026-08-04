-- Migration 120: Per-payment ledger for on-account (credit) sales.
--
-- record_credit_payment() (migration 100) only ever updated sales.amount_paid
-- and appended {method, amount} to sales.payment_splits — no timestamp, no id.
-- That made it impossible to show a customer "which date was this payment
-- made against which invoice", unlike store credit which already has a real
-- ledger (store_credit_transactions, migration 015). This adds the same
-- shape of ledger for on-account sale payments.

CREATE TABLE IF NOT EXISTS sale_payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id       UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES customers(id),
  amount        NUMERIC(10,2) NOT NULL,
  method        TEXT NOT NULL,
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- true for rows backfilled by this migration from payment_splits, where the
  -- original payment date was never recorded — approximated as the sale's
  -- created_at. Lets the UI mark these as "approximate date" instead of
  -- implying precision that doesn't exist for historical payments.
  is_backfilled BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale     ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_customer ON sale_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_business ON sale_payments(business_id);

CREATE OR REPLACE FUNCTION record_credit_payment(
  p_sale_id     UUID,
  p_amount      NUMERIC,
  p_method      TEXT,
  p_business_id UUID DEFAULT NULL,
  p_created_by  UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_total       NUMERIC;
  v_paid        NUMERIC;
  v_new_paid    NUMERIC;
  v_new_status  TEXT;
  v_customer_id UUID;
  v_branch_id   UUID;
BEGIN
  -- Lock the row to prevent concurrent payment races
  SELECT total, amount_paid, customer_id, branch_id
  INTO v_total, v_paid, v_customer_id, v_branch_id
  FROM sales
  WHERE id = p_sale_id
    AND payment_method = 'on_account'
    AND payment_status != 'paid'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found or already fully paid';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  v_new_paid := v_paid + p_amount;

  IF v_new_paid > v_total + 0.01 THEN
    RAISE EXCEPTION 'Payment of % exceeds outstanding balance of %', p_amount, (v_total - v_paid);
  END IF;

  -- Clamp to avoid floating-point overshoot
  v_new_paid := LEAST(v_new_paid, v_total);

  -- Derive new status
  IF v_new_paid >= v_total THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partial';
  END IF;

  UPDATE sales
  SET amount_paid    = v_new_paid,
      payment_status = v_new_status,
      -- Append the payment to the splits array
      payment_splits = payment_splits || jsonb_build_object('method', p_method, 'amount', p_amount)
  WHERE id = p_sale_id;

  INSERT INTO sale_payments (business_id, sale_id, customer_id, amount, method, created_by)
  VALUES (
    COALESCE(p_business_id, (SELECT b.business_id FROM branches b WHERE b.id = v_branch_id)),
    p_sale_id, v_customer_id, p_amount, p_method, p_created_by
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- One-time backfill: give existing on-account sales a ledger entry per
-- payment_splits item, dated at the sale's created_at (best-effort — the
-- original per-payment date was never recorded before this migration).
INSERT INTO sale_payments (business_id, sale_id, customer_id, amount, method, created_by, created_at, is_backfilled)
SELECT
  b.business_id,
  s.id,
  s.customer_id,
  (split->>'amount')::NUMERIC,
  COALESCE(split->>'method', 'unknown'),
  s.cashier_id,
  s.created_at,
  true
FROM sales s
JOIN branches b ON b.id = s.branch_id,
LATERAL jsonb_array_elements(COALESCE(s.payment_splits, '[]'::jsonb)) AS split
WHERE s.payment_method = 'on_account'
  AND (split->>'amount') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sale_payments sp WHERE sp.sale_id = s.id);
