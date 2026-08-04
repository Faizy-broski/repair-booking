-- Drop the hardcoded status CHECK constraint so custom per-business statuses can be stored.
ALTER TABLE repairs DROP CONSTRAINT IF EXISTS repairs_status_check;
