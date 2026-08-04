-- Dedicated address field for the invoice/receipt footer, printed under the
-- thank-you message (separate from footer_line_1/2/3 and the header address).
ALTER TABLE invoice_settings
  ADD COLUMN footer_address TEXT;
