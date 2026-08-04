CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_businesses_name_trgm
  ON businesses USING gin (name gin_trgm_ops);
