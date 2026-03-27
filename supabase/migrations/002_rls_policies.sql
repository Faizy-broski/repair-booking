-- ============================================================
-- 002_rls_policies.sql
-- Row Level Security policies for branch/business data isolation
-- ============================================================

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_business_id()
RETURNS UUID AS $$
  SELECT business_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_branch_id()
RETURNS UUID AS $$
  SELECT branch_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_owner_or_manager()
RETURNS BOOLEAN AS $$
  SELECT role IN ('business_owner','branch_manager') FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- PROFILES
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_profile" ON profiles
  FOR ALL TO authenticated
  USING (id = auth.uid());

CREATE POLICY "owner_sees_business_profiles" ON profiles
  FOR SELECT TO authenticated
  USING (
    business_id = public.user_business_id()
    AND public.is_owner_or_manager()
  );

-- ============================================================
-- BUSINESSES (business owner sees own business only)
-- ============================================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_own_business" ON businesses
  FOR SELECT TO authenticated
  USING (id = public.user_business_id());

CREATE POLICY "owner_updates_own_business" ON businesses
  FOR UPDATE TO authenticated
  USING (id = public.user_business_id())
  WITH CHECK (id = public.user_business_id());

-- ============================================================
-- BRANCHES
-- ============================================================

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_members_see_branches" ON branches
  FOR SELECT TO authenticated
  USING (business_id = public.user_business_id());

CREATE POLICY "owner_manages_branches" ON branches
  FOR ALL TO authenticated
  USING (
    business_id = public.user_business_id()
    AND public.user_role() IN ('business_owner')
  );

-- ============================================================
-- MACRO: branch-scoped tables (owner sees all; staff sees own)
-- Applied to: inventory, sales, sale_items, repairs, repair_items,
--             repair_status_history, expenses, employees, salaries,
--             time_clocks, appointments, messages, invoices,
--             gift_cards, google_reviews, google_review_settings,
--             module_settings, stock_movements, customers
-- ============================================================

-- INVENTORY
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_inventory" ON inventory
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_inventory" ON inventory
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- STOCK MOVEMENTS
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_movements" ON stock_movements
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_movements" ON stock_movements
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- SALES
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_sales" ON sales
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_sales" ON sales
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- SALE ITEMS
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_sale_items" ON sale_items
  FOR ALL TO authenticated
  USING (
    sale_id IN (
      SELECT id FROM sales WHERE branch_id IN (
        SELECT id FROM branches WHERE business_id = public.user_business_id()
      )
    )
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_sale_items" ON sale_items
  FOR ALL TO authenticated
  USING (
    sale_id IN (SELECT id FROM sales WHERE branch_id = public.user_branch_id())
  );

-- REPAIRS
ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_repairs" ON repairs
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_repairs" ON repairs
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- REPAIR ITEMS
ALTER TABLE repair_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_repair_items" ON repair_items
  FOR ALL TO authenticated
  USING (
    repair_id IN (
      SELECT id FROM repairs WHERE branch_id IN (
        SELECT id FROM branches WHERE business_id = public.user_business_id()
      )
    )
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_repair_items" ON repair_items
  FOR ALL TO authenticated
  USING (
    repair_id IN (SELECT id FROM repairs WHERE branch_id = public.user_branch_id())
  );

-- REPAIR STATUS HISTORY
ALTER TABLE repair_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_repair_history" ON repair_status_history
  FOR ALL TO authenticated
  USING (
    repair_id IN (
      SELECT id FROM repairs WHERE branch_id IN (
        SELECT id FROM branches WHERE business_id = public.user_business_id()
      )
    )
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_repair_history" ON repair_status_history
  FOR ALL TO authenticated
  USING (
    repair_id IN (SELECT id FROM repairs WHERE branch_id = public.user_branch_id())
  );

-- CUSTOMERS (business-wide: owner sees all, staff sees own branch origination)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_members_see_customers" ON customers
  FOR ALL TO authenticated
  USING (business_id = public.user_business_id());

-- EXPENSES
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_expenses" ON expenses
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_expenses" ON expenses
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- EXPENSE CATEGORIES
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_members_see_expense_categories" ON expense_categories
  FOR ALL TO authenticated
  USING (business_id = public.user_business_id());

-- EMPLOYEES
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_employees" ON employees
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_employees" ON employees
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- SALARIES
ALTER TABLE salaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_salaries" ON salaries
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_salaries" ON salaries
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- TIME CLOCKS
ALTER TABLE time_clocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_time_clocks" ON time_clocks
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_time_clocks" ON time_clocks
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- APPOINTMENTS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_appointments" ON appointments
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_appointments" ON appointments
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- MESSAGES (all branches in the same business can see messages to them)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_members_see_messages" ON messages
  FOR ALL TO authenticated
  USING (business_id = public.user_business_id());

-- INVOICES
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_invoices" ON invoices
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_invoices" ON invoices
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- GIFT CARDS
ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_gift_cards" ON gift_cards
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_gift_cards" ON gift_cards
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- GOOGLE REVIEWS
ALTER TABLE google_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_all_reviews" ON google_reviews
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_reviews" ON google_reviews
  FOR ALL TO authenticated
  USING (branch_id = public.user_branch_id());

-- GOOGLE REVIEW SETTINGS
ALTER TABLE google_review_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_manages_review_settings" ON google_review_settings
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_review_settings" ON google_review_settings
  FOR SELECT TO authenticated
  USING (branch_id = public.user_branch_id());

-- MODULE SETTINGS
ALTER TABLE module_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_manages_module_settings" ON module_settings
  FOR ALL TO authenticated
  USING (
    branch_id IN (SELECT id FROM branches WHERE business_id = public.user_business_id())
    AND public.is_owner_or_manager()
  );

CREATE POLICY "staff_sees_own_module_settings" ON module_settings
  FOR SELECT TO authenticated
  USING (branch_id = public.user_branch_id());

-- ============================================================
-- BUSINESS-SCOPED TABLES (shared within business)
-- ============================================================

-- PRODUCTS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_members_see_products" ON products
  FOR ALL TO authenticated
  USING (business_id = public.user_business_id());

-- PRODUCT VARIANTS
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_members_see_variants" ON product_variants
  FOR ALL TO authenticated
  USING (
    product_id IN (SELECT id FROM products WHERE business_id = public.user_business_id())
  );

-- BRANDS
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_members_see_brands" ON brands
  FOR ALL TO authenticated
  USING (business_id = public.user_business_id());

-- CATEGORIES
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_members_see_categories" ON categories
  FOR ALL TO authenticated
  USING (business_id = public.user_business_id());

-- CUSTOM FIELD DEFINITIONS
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_members_see_custom_fields" ON custom_field_definitions
  FOR ALL TO authenticated
  USING (business_id = public.user_business_id());

-- PLANS (public read)
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_public_read" ON plans
  FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

-- SUBSCRIPTIONS (business owner only)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_sees_own_subscription" ON subscriptions
  FOR SELECT TO authenticated
  USING (
    business_id = public.user_business_id()
    AND public.user_role() = 'business_owner'
  );
