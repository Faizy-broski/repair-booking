-- Migration 048: Branch Manager Isolation
-- Redefines public.is_owner_or_manager() to only return true for business owners.
-- This restricts branch_manager to standard staff policies, locking them to their assigned branch_id.

CREATE OR REPLACE FUNCTION public.is_owner_or_manager()
RETURNS BOOLEAN AS $$
  SELECT role IN ('business_owner', 'super_admin') FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;
