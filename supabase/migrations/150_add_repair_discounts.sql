-- Adds discount tracking to repairs (overall/invoice-level) and repair_items (per part/labour line).
-- estimated_cost remains the net/final payable total; these columns are for audit + edit-reload display only.

ALTER TABLE repairs
  ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percent')),
  ADD COLUMN discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE repair_items
  ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percent')),
  ADD COLUMN discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
