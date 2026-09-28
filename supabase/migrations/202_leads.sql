-- Migration 202: Marketing site lead capture.
--
-- Every public-facing "lead gen" form on the marketing site (contact us,
-- request a demo, enterprise enquiry, newsletter signup, etc.) writes a row
-- here so the super admin can see, filter, and action every lead from one
-- place, instead of leads only ever landing in an inbox. Modeled on
-- manual_payments (migration 199): internal, super-admin-only table, written
-- exclusively via createAdminClient() (service role) from public API routes
-- and read via the same client from super-admin API routes.

CREATE TABLE IF NOT EXISTS leads (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which form/CTA this lead came from.
  source      TEXT        NOT NULL DEFAULT 'contact_us'
                          CHECK (source IN ('contact_us', 'demo_request', 'enterprise_contact', 'newsletter')),
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  phone       TEXT,
  company     TEXT,
  message     TEXT,
  -- Marketing page the form was submitted from, for attribution.
  page_url    TEXT,
  status      TEXT        NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'closed')),
  -- Free-form extra fields per source (e.g. UTM params) without a migration each time.
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status     ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source     ON leads(source);

CREATE OR REPLACE FUNCTION set_leads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_leads_updated_at();

-- Defense-in-depth backstop, same rationale as manual_payments: the only
-- application access path is createAdminClient() (service role, bypasses
-- RLS), but without this policy Supabase's default grants would expose every
-- lead to any authenticated user via the client-side SDK.
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_leads" ON leads;
CREATE POLICY "super_admin_leads" ON leads
  FOR ALL TO authenticated
  USING (public.user_role() = 'super_admin')
  WITH CHECK (public.user_role() = 'super_admin');
