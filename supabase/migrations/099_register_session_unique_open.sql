-- Enforce at most one open session per branch at the database level.
-- This is the safety net against race conditions that bypass the app-level
-- check in openSession() — e.g. two concurrent POST /api/pos/session/open
-- requests landing before either insert is committed.
CREATE UNIQUE INDEX IF NOT EXISTS register_sessions_branch_open_unique
  ON register_sessions (branch_id)
  WHERE status = 'open';
