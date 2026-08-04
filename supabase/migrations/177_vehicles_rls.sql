-- ============================================================================
-- 177 — RLS for vehicles
-- Business-wide visibility (owner + all staff), mirroring the existing
-- "business_members_see_customers" policy on customers (002_rls_policies.sql)
-- since vehicles are a customer attribute, not branch-scoped operational data.
-- ============================================================================

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_members_see_vehicles" ON vehicles
  FOR ALL TO authenticated
  USING (business_id = public.user_business_id());
