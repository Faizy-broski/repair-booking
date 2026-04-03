-- ============================================================
-- 015_store_credits_loyalty_groups_assets.sql
-- Phase 3: Customer Operations Depth
-- ============================================================

-- ── Store Credits ────────────────────────────────────────────────────────────

CREATE TABLE store_credits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  balance     NUMERIC(10,2) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, customer_id)
);

CREATE TABLE store_credit_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES customers(id),
  amount         NUMERIC(10,2) NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('credit','debit','refund','adjustment')),
  reference_id   UUID,
  reference_type TEXT,
  note           TEXT,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_store_credits_business    ON store_credits(business_id);
CREATE INDEX idx_store_credits_customer    ON store_credits(customer_id);
CREATE INDEX idx_sc_transactions_customer  ON store_credit_transactions(customer_id);
CREATE INDEX idx_sc_transactions_business  ON store_credit_transactions(business_id);

-- Atomic store credit debit — ensures no overdraft
CREATE OR REPLACE FUNCTION apply_store_credit(
  p_business_id UUID,
  p_customer_id UUID,
  p_amount      NUMERIC,
  p_note        TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL,
  p_reference_type TEXT DEFAULT NULL,
  p_created_by  UUID DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  -- Upsert to ensure row exists
  INSERT INTO store_credits(business_id, customer_id, balance)
  VALUES (p_business_id, p_customer_id, 0)
  ON CONFLICT (business_id, customer_id) DO NOTHING;

  -- Lock and check balance
  SELECT balance INTO v_balance
  FROM store_credits
  WHERE business_id = p_business_id AND customer_id = p_customer_id
  FOR UPDATE;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient store credit balance';
  END IF;

  -- Deduct
  UPDATE store_credits
  SET balance = balance - p_amount, updated_at = NOW()
  WHERE business_id = p_business_id AND customer_id = p_customer_id;

  -- Log transaction
  INSERT INTO store_credit_transactions(business_id, customer_id, amount, type, reference_id, reference_type, note, created_by)
  VALUES (p_business_id, p_customer_id, -p_amount, 'debit', p_reference_id, p_reference_type, p_note, p_created_by);

  RETURN v_balance - p_amount;
END;
$$;

-- ── Loyalty Points ───────────────────────────────────────────────────────────

CREATE TABLE loyalty_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  earn_rate    NUMERIC(6,4) DEFAULT 0.01,   -- points per £1 spent
  redeem_rate  NUMERIC(6,4) DEFAULT 0.01,   -- £1 per N points
  min_redeem_points INT DEFAULT 100,
  is_enabled   BOOLEAN DEFAULT false,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE loyalty_points (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  balance     INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, customer_id)
);

CREATE TABLE loyalty_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id    UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES customers(id),
  points         INT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('earned','redeemed','adjusted','expired')),
  reference_id   UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_loyalty_points_business    ON loyalty_points(business_id);
CREATE INDEX idx_loyalty_points_customer    ON loyalty_points(customer_id);
CREATE INDEX idx_loyalty_txns_customer      ON loyalty_transactions(customer_id);

-- ── Customer Groups ──────────────────────────────────────────────────────────

CREATE TABLE customer_groups (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id                UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name                       TEXT NOT NULL,
  tax_class                  TEXT,
  discount_percent           NUMERIC(5,2) DEFAULT 0,
  third_party_billing_enabled BOOLEAN DEFAULT false,
  billing_contact_name       TEXT,
  billing_email              TEXT,
  billing_phone              TEXT,
  net_payment_days           INT DEFAULT 0,
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_groups_business ON customer_groups(business_id);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES customer_groups(id);

-- ── Customer Assets ──────────────────────────────────────────────────────────

CREATE TABLE customer_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  serial_number TEXT,
  imei          TEXT,
  model         TEXT,
  brand         TEXT,
  color         TEXT,
  purchase_date DATE,
  notes         TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_assets_business  ON customer_assets(business_id);
CREATE INDEX idx_customer_assets_customer  ON customer_assets(customer_id);

ALTER TABLE repairs ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES customer_assets(id);

-- ── Customer Duplicate Merge Function ───────────────────────────────────────

CREATE OR REPLACE FUNCTION merge_customers(
  p_keep_id UUID,
  p_drop_id UUID
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE repairs         SET customer_id = p_keep_id WHERE customer_id = p_drop_id;
  UPDATE sales           SET customer_id = p_keep_id WHERE customer_id = p_drop_id;
  UPDATE invoices        SET customer_id = p_keep_id WHERE customer_id = p_drop_id;
  UPDATE appointments    SET customer_id = p_keep_id WHERE customer_id = p_drop_id;
  UPDATE customer_assets SET customer_id = p_keep_id WHERE customer_id = p_drop_id;

  -- Merge store credit balance into the kept customer (sum balances if both exist)
  INSERT INTO store_credits(business_id, customer_id, balance)
    SELECT business_id, p_keep_id, balance FROM store_credits WHERE customer_id = p_drop_id
  ON CONFLICT (business_id, customer_id)
    DO UPDATE SET balance = store_credits.balance + EXCLUDED.balance, updated_at = NOW();
  DELETE FROM store_credits WHERE customer_id = p_drop_id;

  -- Merge loyalty points balance
  INSERT INTO loyalty_points(business_id, customer_id, balance)
    SELECT business_id, p_keep_id, balance FROM loyalty_points WHERE customer_id = p_drop_id
  ON CONFLICT (business_id, customer_id)
    DO UPDATE SET balance = loyalty_points.balance + EXCLUDED.balance, updated_at = NOW();
  DELETE FROM loyalty_points WHERE customer_id = p_drop_id;

  DELETE FROM customers WHERE id = p_drop_id;
END;
$$;
