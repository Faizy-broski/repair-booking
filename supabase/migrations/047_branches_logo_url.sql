-- Add logo_url column to branches table
ALTER TABLE branches ADD COLUMN IF NOT EXISTS logo_url TEXT;
