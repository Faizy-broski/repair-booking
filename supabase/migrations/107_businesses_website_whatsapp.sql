-- Add website and whatsapp fields to businesses, collected at registration.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS website   TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS whatsapp  TEXT;
