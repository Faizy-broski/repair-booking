-- Invoice numbers showed "INV-202607-1013" (year+month baked in from
-- TO_CHAR(NOW(), 'YYYYMM')), which is noisy and resets meaning every month.
-- Drop the date segment so invoices/receipts just show "INV-1013", and reset
-- every business's per-tenant counter (businesses.invoice_seq, added in
-- 165_per_business_invoice_numbering.sql) to start from 1000.

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

  RETURN 'INV-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

UPDATE businesses SET invoice_seq = 1000;
