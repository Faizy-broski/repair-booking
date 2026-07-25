-- Adds a per-business/branch toggle to hide the pricing breakdown (repair fee,
-- individual part prices, subtotal/discount/tax) on customer invoices and
-- receipts, showing only the final payable amount. Line item descriptions
-- and the total/balance due remain visible. Full pricing is still stored
-- and computed server-side — this only affects presentation.
alter table public.invoice_settings
  add column if not exists show_final_amount_only boolean not null default false;
