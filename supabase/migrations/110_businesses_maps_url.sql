-- Add optional Google Maps link to businesses, collected at registration alongside address.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS maps_url TEXT;
