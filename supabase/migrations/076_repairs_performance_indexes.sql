-- Migration 076: Additional repairs indexes not in 073
-- 073 already has: idx_repairs_branch_created, idx_repairs_branch_status, idx_repairs_customer, idx_repairs_job_number

-- Composite (branch + status + date) — covers filtered list queries in one index
CREATE INDEX IF NOT EXISTS idx_repairs_branch_status_created
  ON repairs(branch_id, status, created_at DESC);
