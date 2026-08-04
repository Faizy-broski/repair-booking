-- ============================================================
-- Fix missing ON DELETE CASCADE / ON DELETE SET NULL rules
-- so that deleting a business cascades cleanly through the
-- entire data hierarchy without FK constraint violations.
--
-- Strategy:
--   • Tables that are organisationally "owned" by a business/branch
--     get ON DELETE CASCADE (their rows are meaningless without the parent).
--   • Transactional records (sales, repairs, invoices) keep their rows but
--     get ON DELETE SET NULL on the product/variant/customer pointer so the
--     history is preserved even after the referenced row is gone.
-- ============================================================

-- ── repair_estimates (migration 012) ──────────────────────────────────────
ALTER TABLE repair_estimates   
  DROP CONSTRAINT IF EXISTS repair_estimates_business_id_fkey,
  ADD  CONSTRAINT repair_estimates_business_id_fkey
       FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE repair_estimates
  DROP CONSTRAINT IF EXISTS repair_estimates_branch_id_fkey,
  ADD  CONSTRAINT repair_estimates_branch_id_fkey
       FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

ALTER TABLE repair_estimates
  DROP CONSTRAINT IF EXISTS repair_estimates_customer_id_fkey,
  ADD  CONSTRAINT repair_estimates_customer_id_fkey
       FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- ── sale_items (migration 001) ─────────────────────────────────────────────
-- Preserve sale history even if the product/variant is later deleted.
ALTER TABLE sale_items
  DROP CONSTRAINT IF EXISTS sale_items_product_id_fkey,
  ADD  CONSTRAINT sale_items_product_id_fkey
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE sale_items
  DROP CONSTRAINT IF EXISTS sale_items_variant_id_fkey,
  ADD  CONSTRAINT sale_items_variant_id_fkey
       FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;

-- ── repair_items (migration 001) ───────────────────────────────────────────
ALTER TABLE repair_items
  DROP CONSTRAINT IF EXISTS repair_items_product_id_fkey,
  ADD  CONSTRAINT repair_items_product_id_fkey
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

ALTER TABLE repair_items
  DROP CONSTRAINT IF EXISTS repair_items_variant_id_fkey,
  ADD  CONSTRAINT repair_items_variant_id_fkey
       FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;

-- ── stock_movements (migration 001) ───────────────────────────────────────
ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_product_id_fkey,
  ADD  CONSTRAINT stock_movements_product_id_fkey
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- ── messages (migration 001) ───────────────────────────────────────────────
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_from_branch_id_fkey,
  ADD  CONSTRAINT messages_from_branch_id_fkey
       FOREIGN KEY (from_branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_to_branch_id_fkey,
  ADD  CONSTRAINT messages_to_branch_id_fkey
       FOREIGN KEY (to_branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- ── service_problem_parts (migration 013) — config rows, cascade with product ─────
ALTER TABLE service_problem_parts
  DROP CONSTRAINT IF EXISTS service_problem_parts_product_id_fkey,
  ADD  CONSTRAINT service_problem_parts_product_id_fkey
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- ── purchase_orders / purchase_order_items (migration 016) ────────────────
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_branch_id_fkey,
  ADD  CONSTRAINT purchase_orders_branch_id_fkey
       FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

ALTER TABLE purchase_order_items
  DROP CONSTRAINT IF EXISTS purchase_order_items_product_id_fkey,
  ADD  CONSTRAINT purchase_order_items_product_id_fkey
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- ── goods_receiving_notes (migration 016) ─────────────────────────────────
ALTER TABLE goods_receiving_notes
  DROP CONSTRAINT IF EXISTS goods_receiving_notes_branch_id_fkey,
  ADD  CONSTRAINT goods_receiving_notes_branch_id_fkey
       FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

-- ── special_orders (migration 016) ────────────────────────────────────────
ALTER TABLE special_orders
  DROP CONSTRAINT IF EXISTS special_orders_branch_id_fkey,
  ADD  CONSTRAINT special_orders_branch_id_fkey
       FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

ALTER TABLE special_orders
  DROP CONSTRAINT IF EXISTS special_orders_product_id_fkey,
  ADD  CONSTRAINT special_orders_product_id_fkey
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- ── inventory_serials (migration 017) ─────────────────────────────────────
ALTER TABLE inventory_serials
  DROP CONSTRAINT IF EXISTS inventory_serials_branch_id_fkey,
  ADD  CONSTRAINT inventory_serials_branch_id_fkey
       FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

-- ── inventory_cost_layers (migration 017) ─────────────────────────────────
ALTER TABLE inventory_cost_layers
  DROP CONSTRAINT IF EXISTS inventory_cost_layers_branch_id_fkey,
  ADD  CONSTRAINT inventory_cost_layers_branch_id_fkey
       FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

-- ── inventory_counts + inventory_count_items (migration 017) ──────────────
ALTER TABLE inventory_counts
  DROP CONSTRAINT IF EXISTS inventory_counts_business_id_fkey,
  ADD  CONSTRAINT inventory_counts_business_id_fkey
       FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE inventory_counts
  DROP CONSTRAINT IF EXISTS inventory_counts_branch_id_fkey,
  ADD  CONSTRAINT inventory_counts_branch_id_fkey
       FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

ALTER TABLE inventory_count_items
  DROP CONSTRAINT IF EXISTS inventory_count_items_product_id_fkey,
  ADD  CONSTRAINT inventory_count_items_product_id_fkey
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- ── product_bundles + product_bundle_items (migration 017) ────────────────
ALTER TABLE product_bundles
  DROP CONSTRAINT IF EXISTS product_bundles_business_id_fkey,
  ADD  CONSTRAINT product_bundles_business_id_fkey
       FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE product_bundle_items
  DROP CONSTRAINT IF EXISTS product_bundle_items_product_id_fkey,
  ADD  CONSTRAINT product_bundle_items_product_id_fkey
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- ── trade_in_transactions (migration 017) ─────────────────────────────────
ALTER TABLE trade_in_transactions
  DROP CONSTRAINT IF EXISTS trade_in_transactions_business_id_fkey,
  ADD  CONSTRAINT trade_in_transactions_business_id_fkey
       FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE trade_in_transactions
  DROP CONSTRAINT IF EXISTS trade_in_transactions_branch_id_fkey,
  ADD  CONSTRAINT trade_in_transactions_branch_id_fkey
       FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

ALTER TABLE trade_in_transactions
  DROP CONSTRAINT IF EXISTS trade_in_transactions_product_id_fkey,
  ADD  CONSTRAINT trade_in_transactions_product_id_fkey
       FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- ── shifts + payroll_periods (migration 019) ──────────────────────────────
ALTER TABLE shifts
  DROP CONSTRAINT IF EXISTS shifts_branch_id_fkey,
  ADD  CONSTRAINT shifts_branch_id_fkey
       FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

ALTER TABLE payroll_periods
  DROP CONSTRAINT IF EXISTS payroll_periods_branch_id_fkey,
  ADD  CONSTRAINT payroll_periods_branch_id_fkey
       FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

-- ── employee_activity_log (migration 020) — keep logs, nullify branch ref ─
ALTER TABLE employee_activity_log
  DROP CONSTRAINT IF EXISTS employee_activity_log_branch_id_fkey,
  ADD  CONSTRAINT employee_activity_log_branch_id_fkey
       FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
