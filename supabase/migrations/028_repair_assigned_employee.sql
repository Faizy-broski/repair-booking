-- ============================================================
-- 027_repair_assigned_employee.sql
-- Change repairs.assigned_to FK from profiles(id) to employees(id)
-- Employees are the correct entity for technician assignment —
-- they don't require an auth login/profile to be assignable.
-- ============================================================

-- Drop existing FK (references profiles)
ALTER TABLE repairs DROP CONSTRAINT IF EXISTS repairs_assigned_to_fkey;

-- Re-add pointing at employees
ALTER TABLE repairs
  ADD CONSTRAINT repairs_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL;
