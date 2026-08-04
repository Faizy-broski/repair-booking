-- Migration 096: Dashboard activity log index
-- The dashboard activity log widget orders repair_status_history by created_at DESC.
-- The only existing index is on repair_id (for JOIN); add an order-by index so the
-- LIMIT 20 sort does not require a full table scan.
-- Safe to re-run: IF NOT EXISTS is idempotent.

CREATE INDEX IF NOT EXISTS idx_repair_status_history_created_at
  ON repair_status_history(created_at DESC);
