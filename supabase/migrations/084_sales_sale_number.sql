-- 084 — add sale_number generated column for text-searchable invoice #
-- Stores the last 8 chars of the UUID uppercased (matches the UI display)

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS sale_number TEXT
  GENERATED ALWAYS AS (upper(right(id::text, 8))) STORED;

CREATE INDEX IF NOT EXISTS idx_sales_sale_number ON sales(sale_number);
