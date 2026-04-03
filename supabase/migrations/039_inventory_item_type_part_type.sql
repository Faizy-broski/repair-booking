-- Add item_type (product | part) and part_type columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'product';
ALTER TABLE products ADD COLUMN IF NOT EXISTS part_type TEXT;

-- Migrate existing service rows to parts (services with stock are effectively parts)
-- Leave is_service as-is for backward compat, but new UI will use item_type
