-- ============================================================================
-- 024 — Plan Limits & Business Vertical Templates
-- Phase 10: Superadmin & Plan Management
-- ============================================================================

-- ── 1. Add limits JSONB to plans ─────────────────────────────────────────────
-- Stores granular per-plan limits beyond max_branches/max_users:
--   max_custom_fields, max_products, max_services, max_employees,
--   max_customers, has_api_access, has_white_label, has_priority_support,
--   storage_limit_mb, etc.
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS limits jsonb DEFAULT '{}' NOT NULL;

COMMENT ON COLUMN plans.limits IS 'Granular feature limits JSONB: max_custom_fields, max_products, storage_limit_mb, has_api_access, etc.';

-- ── 2. Business Vertical Templates table ─────────────────────────────────────
-- A vertical template bundles a pre-selected set of modules + default settings
-- for a specific business type (repair shop, salon, retail, etc.)
CREATE TABLE IF NOT EXISTS business_vertical_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  description   text,
  icon          text DEFAULT 'store',
  -- Which modules are enabled by default for this vertical
  modules_enabled text[] NOT NULL DEFAULT '{}',
  -- Default module settings for each enabled module (keyed by module name)
  module_settings jsonb NOT NULL DEFAULT '{}',
  -- Optional: suggest a default plan for businesses using this vertical
  default_plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bvt_slug ON business_vertical_templates(slug);
CREATE INDEX IF NOT EXISTS idx_bvt_active ON business_vertical_templates(is_active) WHERE is_active = true;

-- ── 3. Link businesses to vertical templates ─────────────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS vertical_template_id uuid REFERENCES business_vertical_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN businesses.vertical_template_id IS 'The business vertical template used when this business was created';

-- ── 4. Vertical template application log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS vertical_template_apply_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid NOT NULL REFERENCES business_vertical_templates(id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  applied_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  apply_mode      text NOT NULL DEFAULT 'initial' CHECK (apply_mode IN ('initial', 'reapply', 'merge')),
  modules_applied text[] NOT NULL DEFAULT '{}',
  diff_snapshot   jsonb DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vtal_business ON vertical_template_apply_log(business_id);
CREATE INDEX IF NOT EXISTS idx_vtal_template ON vertical_template_apply_log(template_id);

-- ── 5. Template push diff snapshots table ────────────────────────────────────
-- Stores pre-computed diffs for template push preview
CREATE TABLE IF NOT EXISTS template_push_previews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid NOT NULL REFERENCES module_config_templates(id) ON DELETE CASCADE,
  business_id     uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  push_mode       text NOT NULL CHECK (push_mode IN ('force_override', 'merge_missing_only')),
  diff            jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);

CREATE INDEX IF NOT EXISTS idx_tpp_template ON template_push_previews(template_id);

-- ── 6. RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE business_vertical_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE vertical_template_apply_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_push_previews ENABLE ROW LEVEL SECURITY;

-- Vertical templates: readable by authenticated users, writable by superadmin via service_role
CREATE POLICY "bvt_read" ON business_vertical_templates
  FOR SELECT TO authenticated USING (is_active = true);

-- Apply log: only business members can see their own logs
CREATE POLICY "vtal_read" ON vertical_template_apply_log
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT business_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Push previews: service_role only (created & read by backend)
-- No authenticated policies needed — backend uses adminSupabase

-- ── 7. Helper function: check plan limits ────────────────────────────────────
CREATE OR REPLACE FUNCTION check_plan_limit(
  p_business_id uuid,
  p_limit_key text,
  p_current_count int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_row record;
  v_limit_value int;
  v_allowed boolean;
BEGIN
  -- Get the plan for this business via subscription
  SELECT p.max_branches, p.max_users, p.limits
  INTO v_plan_row
  FROM subscriptions s
  JOIN plans p ON p.id = s.plan_id
  WHERE s.business_id = p_business_id
    AND s.status IN ('active', 'trialing')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_plan_row IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'No active subscription');
  END IF;

  -- Check built-in limits first
  IF p_limit_key = 'max_branches' THEN
    v_limit_value := v_plan_row.max_branches;
  ELSIF p_limit_key = 'max_users' THEN
    v_limit_value := v_plan_row.max_users;
  ELSE
    -- Check in limits JSONB
    v_limit_value := (v_plan_row.limits ->> p_limit_key)::int;
  END IF;

  IF v_limit_value IS NULL THEN
    -- No limit set = unlimited
    RETURN jsonb_build_object('allowed', true, 'limit', null, 'current', p_current_count);
  END IF;

  v_allowed := p_current_count < v_limit_value;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'limit', v_limit_value,
    'current', p_current_count,
    'reason', CASE WHEN NOT v_allowed THEN 'Plan limit reached (' || p_limit_key || ': ' || v_limit_value || ')' ELSE null END
  );
END;
$$;

-- ── 8. Seed default vertical templates ───────────────────────────────────────
INSERT INTO business_vertical_templates (name, slug, description, icon, modules_enabled, module_settings, sort_order)
VALUES
  (
    'Repair Shop',
    'repair-shop',
    'Phone, computer, and electronics repair businesses',
    'wrench',
    ARRAY['pos', 'inventory', 'repairs', 'customers', 'invoices', 'employees', 'expenses', 'reports'],
    '{
      "repairs": {"warranty_days": 90, "require_deposit": true, "default_deposit_pct": 50, "sms_on_status_change": true},
      "pos": {"tax_rate": 0.20, "tax_label": "VAT", "require_customer": true},
      "inventory": {"low_stock_threshold": 5, "track_serial_numbers": true}
    }'::jsonb,
    1
  ),
  (
    'Retail Store',
    'retail-store',
    'General retail, clothing, accessories, and merchandise shops',
    'shopping-bag',
    ARRAY['pos', 'inventory', 'customers', 'invoices', 'employees', 'expenses', 'reports', 'gift_cards'],
    '{
      "pos": {"tax_rate": 0.20, "tax_label": "VAT", "allow_discounts": true, "enable_split_payment": true},
      "inventory": {"low_stock_threshold": 10, "track_serial_numbers": false},
      "gift_cards": {"expiry_days": 365, "allow_partial_redemption": true}
    }'::jsonb,
    2
  ),
  (
    'Beauty Salon',
    'beauty-salon',
    'Hair salons, barber shops, nail salons, and beauty parlours',
    'scissors',
    ARRAY['pos', 'customers', 'appointments', 'employees', 'expenses', 'invoices', 'reports', 'messages'],
    '{
      "appointments": {"slot_duration_minutes": 30, "buffer_minutes": 10, "allow_online_booking": true, "booking_advance_days": 30},
      "pos": {"tax_rate": 0.20, "tax_label": "VAT", "require_customer": true},
      "employees": {"track_time": true, "pay_period": "monthly"}
    }'::jsonb,
    3
  ),
  (
    'Coffee & Food',
    'coffee-food',
    'Coffee shops, cafes, bakeries, and small food establishments',
    'coffee',
    ARRAY['pos', 'inventory', 'employees', 'expenses', 'reports'],
    '{
      "pos": {"tax_rate": 0.20, "tax_label": "VAT", "allow_discounts": true, "require_customer": false},
      "inventory": {"low_stock_threshold": 20, "allow_negative_stock": false}
    }'::jsonb,
    4
  ),
  (
    'IT Services',
    'it-services',
    'IT support, managed services, and tech consulting businesses',
    'monitor',
    ARRAY['pos', 'inventory', 'repairs', 'customers', 'invoices', 'employees', 'expenses', 'reports', 'messages', 'appointments'],
    '{
      "repairs": {"warranty_days": 30, "require_deposit": false, "sms_on_status_change": true},
      "appointments": {"slot_duration_minutes": 60, "buffer_minutes": 15, "allow_online_booking": true},
      "invoices": {"default_due_days": 30, "show_tax_breakdown": true}
    }'::jsonb,
    5
  ),
  (
    'Generic Business',
    'generic',
    'A flexible starting point — enable only the modules you need',
    'store',
    ARRAY['pos', 'customers', 'invoices', 'reports'],
    '{
      "pos": {"tax_rate": 0.20, "tax_label": "VAT"}
    }'::jsonb,
    6
  )
ON CONFLICT (slug) DO NOTHING;
