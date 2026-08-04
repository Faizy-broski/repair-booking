-- invoice_seq was a single sequence shared by every tenant, so there was no
-- way to change one business's invoice numbering without affecting everyone
-- else. This moves the counter onto businesses.invoice_seq (one per tenant)
-- and rewrites generate_invoice_number() to increment that row atomically
-- instead of NEXTVAL('invoice_seq').

ALTER TABLE businesses ADD COLUMN invoice_seq BIGINT NOT NULL DEFAULT 1;

-- Backfill: continue every existing business from the current global
-- sequence value so no business's next invoice number collides with one
-- already issued under the old shared sequence.
UPDATE businesses SET invoice_seq = (SELECT last_value + 1 FROM invoice_seq);

-- Phones & Gadgets starts fresh from 1000.
UPDATE businesses SET invoice_seq = 1000 WHERE email = 'mubeen912009@hotmail.com';

CREATE OR REPLACE FUNCTION generate_invoice_number(p_branch_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_business_id UUID;
  v_seq         BIGINT;
BEGIN
  SELECT business_id INTO v_business_id FROM branches WHERE id = p_branch_id;

  UPDATE businesses
  SET invoice_seq = invoice_seq + 1
  WHERE id = v_business_id
  RETURNING invoice_seq INTO v_seq;

  RETURN 'INV-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
