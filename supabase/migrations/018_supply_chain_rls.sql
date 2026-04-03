-- ═══════════════════════════════════════════════════════════════════
-- 018 — RLS policies for supply-chain tables
-- ═══════════════════════════════════════════════════════════════════

-- ── Suppliers (business-scoped, no branch) ────────────────────────
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_suppliers" ON suppliers
  FOR ALL TO authenticated
  USING (business_id = public.user_business_id() AND public.is_owner_or_manager());

CREATE POLICY "staff_reads_suppliers" ON suppliers
  FOR SELECT TO authenticated
  USING (business_id = public.user_business_id());

-- ── Purchase Orders (branch-scoped) ──────────────────────────────
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_purchase_orders" ON purchase_orders
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_purchase_orders" ON purchase_orders
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- ── Purchase Order Items (cascades via po_id) ────────────────────
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_po_items" ON purchase_order_items
  FOR ALL TO authenticated
  USING (
    po_id IN (
      SELECT id FROM purchase_orders
      WHERE branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    )
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_po_items" ON purchase_order_items
  FOR ALL TO authenticated
  USING (
    po_id IN (SELECT id FROM purchase_orders WHERE branch_id = public.user_branch_id())
  );

-- ── Goods Receiving Notes (branch-scoped) ────────────────────────
ALTER TABLE goods_receiving_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_grn" ON goods_receiving_notes
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_grn" ON goods_receiving_notes
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- ── GRN Items (cascades via grn_id) ─────────────────────────────
ALTER TABLE grn_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_grn_items" ON grn_items
  FOR ALL TO authenticated
  USING (
    grn_id IN (
      SELECT id FROM goods_receiving_notes
      WHERE branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    )
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_grn_items" ON grn_items
  FOR ALL TO authenticated
  USING (
    grn_id IN (SELECT id FROM goods_receiving_notes WHERE branch_id = public.user_branch_id())
  );

-- ── Special Orders (business-scoped with branch) ─────────────────
ALTER TABLE special_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_special_orders" ON special_orders
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_special_orders" ON special_orders
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());
