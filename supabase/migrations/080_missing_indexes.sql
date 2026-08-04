-- Migration 080: Missing composite and partial indexes
-- These were absent from 073/076/077 and cause full table scans on
-- the hot query paths (sale detail, repair detail, report queries).
-- All use IF NOT EXISTS so they are safe to re-run.

-- sale_items: JOIN/RLS queries filter by sale_id — no index existed
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id
  ON sale_items(sale_id);

-- repair_items: every repair detail page loads items by repair_id
CREATE INDEX IF NOT EXISTS idx_repair_items_repair_id
  ON repair_items(repair_id);

-- repair_status_history: loaded on every repair detail; timeline query
CREATE INDEX IF NOT EXISTS idx_repair_status_history_repair_id
  ON repair_status_history(repair_id);

-- stock_movements: dashboard and reports filter by branch + movement type
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch_type
  ON stock_movements(branch_id, type);

-- expenses: date-range reports filter by branch + expense_date
CREATE INDEX IF NOT EXISTS idx_expenses_branch_created
  ON expenses(branch_id, created_at DESC);

-- time_clocks: shift reports filter by branch + employee
CREATE INDEX IF NOT EXISTS idx_time_clocks_branch_employee
  ON time_clocks(branch_id, employee_id);

-- invoices: status-filtered lists (open, paid, overdue)
CREATE INDEX IF NOT EXISTS idx_invoices_branch_status
  ON invoices(branch_id, status);

-- gift_cards: active-card lookups (most queries skip inactive cards)
CREATE INDEX IF NOT EXISTS idx_gift_cards_branch_active
  ON gift_cards(branch_id, is_active)
  WHERE is_active = true;

-- repairs: partial index for open/in-progress status — used by dashboard stats
-- get_dashboard_stats() counts these statuses; 076 has (branch, status, date)
-- but this narrower partial index is faster for the count-only queries
CREATE INDEX IF NOT EXISTS idx_repairs_status_open
  ON repairs(branch_id, status)
  WHERE status IN ('received', 'in_progress', 'waiting_parts');

-- purchase_orders: status-filtered lists
CREATE INDEX IF NOT EXISTS idx_po_branch_status
  ON purchase_orders(branch_id, status);
