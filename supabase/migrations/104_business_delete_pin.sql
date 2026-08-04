-- Add business-level delete protection PIN (retail store template only)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS delete_pin TEXT;
