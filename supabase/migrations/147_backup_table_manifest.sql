-- ============================================================
-- 147 — Self-discovering table manifest for the daily backup system
--
-- backup.service.ts used to hardcode which tables get backed up per
-- business. That list just proved itself unreliable — 15 real tables
-- (messages, sale_payments, employee_activity_log, ...) had been added by
-- later migrations and nobody remembered to add them to the array, so they
-- were silently never backed up.
--
-- Fix: discover top-level business/branch-scoped tables from the live
-- schema at export time instead of a hardcoded list — a future migration
-- that adds a `business_id` or `branch_id` column is picked up automatically,
-- no code change required. Tables with neither column (pure children, e.g.
-- sale_items keyed by sale_id) still need their FK relationship declared by
-- hand in CHILD_TABLE_MAP — that part changes far less often and getting it
-- wrong risks backing up the wrong rows, so it stays manual.
-- ============================================================

CREATE OR REPLACE FUNCTION get_backup_table_manifest()
RETURNS TABLE(table_name text, scope_column text)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT c.table_name::text,
         -- Prefer business_id when a table has both (e.g. employee_activity_log
         -- has an optional branch_id on top of a required business_id) — the
         -- broader scope is the correct one to paginate a per-business export by.
         (CASE WHEN bool_or(c.column_name = 'business_id') THEN 'business_id'
               ELSE 'branch_id' END)::text AS scope_column
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema
   AND t.table_name   = c.table_name
   AND t.table_type   = 'BASE TABLE'
  WHERE c.table_schema = 'public'
    AND c.column_name IN ('business_id', 'branch_id')
    -- backup_registry: metadata *about* backups, not business data.
    -- impersonation_sessions: superadmin security audit trail, not something
    -- a business would expect restored alongside their operational data.
    AND c.table_name NOT IN ('backup_registry', 'impersonation_sessions')
  GROUP BY c.table_name
  ORDER BY c.table_name;
$$;

-- Companion — every base table in `public`, so backup.service.ts can diff
-- against the manifest above + its own CHILD_TABLE_MAP + a small manual
-- exclude list (global/reference tables: plans, module_config_templates, ...)
-- and log a warning for anything genuinely unaccounted for, instead of a new
-- child table silently going unbacked-up forever the way the last 15 did.
CREATE OR REPLACE FUNCTION get_all_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT t.table_name::text
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
$$;

REVOKE ALL ON FUNCTION get_backup_table_manifest() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_backup_table_manifest() TO service_role;

REVOKE ALL ON FUNCTION get_all_public_tables() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_all_public_tables() TO service_role;
