-- Add city to businesses, collected at registration alongside country and address.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS city TEXT;
