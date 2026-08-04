-- ── Migration 049: Rush Job flag on repairs ────────────────────────────────────
-- Adds is_rush boolean to repairs table (default false, not null)
-- Rush jobs float to the top of the queue via the updated index

ALTER TABLE repairs
  ADD COLUMN IF NOT EXISTS is_rush boolean NOT NULL DEFAULT false;

-- Index: rush jobs always appear before normal jobs in the default sort
-- (is_rush DESC, created_at DESC)
CREATE INDEX IF NOT EXISTS repairs_rush_queue_idx
  ON repairs (branch_id, is_rush DESC, created_at DESC)
  WHERE status NOT IN ('collected', 'unrepairable');

COMMENT ON COLUMN repairs.is_rush IS
  'When true this job is treated as priority — it floats to top of the queue and is marked on the receipt.';
