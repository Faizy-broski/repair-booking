-- Migration 043: Per-business SMTP email configuration
-- Adds per-business SMTP settings so each tenant can send emails from their own address.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS smtp_host     TEXT,
  ADD COLUMN IF NOT EXISTS smtp_port     INTEGER DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_user     TEXT,
  ADD COLUMN IF NOT EXISTS smtp_pass     TEXT,
  ADD COLUMN IF NOT EXISTS smtp_from     TEXT,
  ADD COLUMN IF NOT EXISTS smtp_secure   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS smtp_enabled  BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN businesses.smtp_host    IS 'SMTP server hostname, e.g. smtp.gmail.com';
COMMENT ON COLUMN businesses.smtp_port    IS 'SMTP port (587 for TLS, 465 for SSL)';
COMMENT ON COLUMN businesses.smtp_user    IS 'SMTP authentication username / email';
COMMENT ON COLUMN businesses.smtp_pass    IS 'SMTP authentication password or app password';
COMMENT ON COLUMN businesses.smtp_from    IS 'From address shown to recipients, e.g. repairs@myshop.com';
COMMENT ON COLUMN businesses.smtp_secure  IS 'Use SSL (port 465). False = STARTTLS (port 587)';
COMMENT ON COLUMN businesses.smtp_enabled IS 'If true, use this business SMTP config instead of the global platform credentials';
