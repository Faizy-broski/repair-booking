-- Add customer_ids array column for multi-customer gift cards
-- NULL or empty array = valid for ALL customers
-- Non-empty array = only valid for listed customers

ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS customer_ids UUID[] DEFAULT '{}';

-- Migrate existing customer_id data into customer_ids
UPDATE gift_cards
SET customer_ids = ARRAY[customer_id]
WHERE customer_id IS NOT NULL;
