-- Add lock_type and passcode to repairs table
ALTER TABLE repairs
ADD COLUMN lock_type text,
ADD COLUMN passcode text;
