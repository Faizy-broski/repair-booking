-- ============================================================
-- 006_module_config.sql
-- Three-layer module configuration system
-- Additive only — zero downtime, zero data loss
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- TABLE: module_config_templates
-- Superadmin-managed shared configuration presets per module.
-- Multiple businesses point to the same row — no duplication.
-- ────────────────────────────────────────────────────────────
CREATE TABLE module_config_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module      TEXT NOT NULL CHECK (module IN (
                'pos','inventory','repairs','customers','appointments',
                'expenses','employees','reports','messages','invoices',
                'gift_cards','google_reviews','phone'
              )),
  name        TEXT NOT NULL,
  description TEXT,
  settings    JSONB NOT NULL DEFAULT '{}',
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  version     INT NOT NULL DEFAULT 1,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (module, name)
);

-- Only one default template per module
CREATE UNIQUE INDEX idx_mct_default
  ON module_config_templates (module)
  WHERE is_default = TRUE;

-- ────────────────────────────────────────────────────────────
-- TABLE: business_module_access
-- Per-business module visibility control and template linkage.
-- Layer 2 in the inheritance chain (plan → business → branch).
-- ────────────────────────────────────────────────────────────
CREATE TABLE business_module_access (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  module            TEXT NOT NULL CHECK (module IN (
                      'pos','inventory','repairs','customers','appointments',
                      'expenses','employees','reports','messages','invoices',
                      'gift_cards','google_reviews','phone'
                    )),
  -- Whether the module is enabled for this business (subject to plan ceiling)
  is_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  -- NULL = respect plan; TRUE = grant even if not in plan; FALSE = deny even if in plan
  plan_override     BOOLEAN,
  -- Points to a shared template; NULL = no template (use empty base)
  template_id       UUID REFERENCES module_config_templates(id) ON DELETE SET NULL,
  -- Tracks which version of the template was last synced
  template_version  INT,
  -- Business-specific settings that override the template
  settings_override JSONB NOT NULL DEFAULT '{}',
  assigned_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, module)
);

CREATE INDEX idx_bma_business ON business_module_access(business_id);
CREATE INDEX idx_bma_template ON business_module_access(template_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: branch_module_overrides
-- Per-branch settings on top of the business config.
-- Layer 3 (deepest) in the inheritance chain.
-- Mirrors module_settings but for the new system.
-- ────────────────────────────────────────────────────────────
CREATE TABLE branch_module_overrides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id         UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  module            TEXT NOT NULL CHECK (module IN (
                      'pos','inventory','repairs','customers','appointments',
                      'expenses','employees','reports','messages','invoices',
                      'gift_cards','google_reviews','phone'
                    )),
  settings_override JSONB NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (branch_id, module)
);

CREATE INDEX idx_bmo_branch ON branch_module_overrides(branch_id);

-- ────────────────────────────────────────────────────────────
-- TABLE: module_config_template_push_log
-- Audit trail for superadmin template push operations.
-- ────────────────────────────────────────────────────────────
CREATE TABLE module_config_template_push_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           UUID NOT NULL REFERENCES module_config_templates(id),
  pushed_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  affected_business_ids UUID[],
  old_version           INT,
  new_version           INT,
  push_mode             TEXT NOT NULL
                          CHECK (push_mode IN ('force_override','merge_missing_only')),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- module_config_templates: public read, superadmin writes via service_role
ALTER TABLE module_config_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mct_authenticated_read" ON module_config_templates
  FOR SELECT TO authenticated USING (TRUE);

-- business_module_access: tenants read own; superadmin writes via service_role
ALTER TABLE business_module_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bma_own_business_read" ON business_module_access
  FOR SELECT TO authenticated
  USING (business_id = public.user_business_id());

-- branch_module_overrides: owner/manager full access; staff read own branch
ALTER TABLE branch_module_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bmo_manager_all" ON branch_module_overrides
  FOR ALL TO authenticated
  USING (
    branch_id IN (
      SELECT id FROM branches WHERE business_id = public.user_business_id()
    )
    AND public.is_owner_or_manager()
  )
  WITH CHECK (
    branch_id IN (
      SELECT id FROM branches WHERE business_id = public.user_business_id()
    )
    AND public.is_owner_or_manager()
  );

CREATE POLICY "bmo_staff_read_own" ON branch_module_overrides
  FOR SELECT TO authenticated
  USING (branch_id = public.user_branch_id());

-- push log: superadmin only via service_role; no tenant policies needed
ALTER TABLE module_config_template_push_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FUNCTION: resolve_module_config(branch_id, module)
-- Returns the fully merged JSONB config for a single branch+module,
-- including _meta flags consumed by the frontend.
-- Resolution order: template.settings <- bma.settings_override <- bmo.settings_override
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_module_config(
  p_branch_id UUID,
  p_module    TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_business_id   UUID;
  v_plan_features JSONB;
  v_plan_enabled  BOOLEAN;
  v_bma           RECORD;
  v_template_cfg  JSONB := '{}';
  v_template_name TEXT  := NULL;
  v_branch_cfg    JSONB := '{}';
  v_resolved      JSONB;
BEGIN
  -- 1. Resolve business from branch
  SELECT business_id INTO v_business_id
    FROM branches WHERE id = p_branch_id;

  IF v_business_id IS NULL THEN
    RETURN jsonb_build_object('_meta', jsonb_build_object(
      'module', p_module, 'is_enabled', FALSE,
      'template_id', NULL, 'template_name', NULL, 'has_override', FALSE
    ));
  END IF;

  -- 2. Check plan ceiling (plans.features is JSONB array of module strings)
  SELECT p.features INTO v_plan_features
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.business_id = v_business_id
      AND s.status IN ('trialing','active','past_due')
    ORDER BY s.created_at DESC
    LIMIT 1;

  v_plan_enabled := (v_plan_features IS NOT NULL AND v_plan_features @> to_jsonb(p_module));

  -- 3. Load business module access record
  SELECT * INTO v_bma
    FROM business_module_access
    WHERE business_id = v_business_id AND module = p_module;

  -- 4. Load template settings
  IF v_bma.template_id IS NOT NULL THEN
    SELECT settings, name INTO v_template_cfg, v_template_name
      FROM module_config_templates WHERE id = v_bma.template_id;
    v_template_cfg := COALESCE(v_template_cfg, '{}');
  END IF;

  -- 5. Load branch overrides
  SELECT settings_override INTO v_branch_cfg
    FROM branch_module_overrides
    WHERE branch_id = p_branch_id AND module = p_module;
  v_branch_cfg := COALESCE(v_branch_cfg, '{}');

  -- 6. Deep merge: template <- business_override <- branch_override
  v_resolved := jsonb_strip_nulls(
    v_template_cfg
    || COALESCE(v_bma.settings_override, '{}')
    || v_branch_cfg
  );

  -- 7. Compute final is_enabled:
  --    plan_override takes precedence over plan ceiling;
  --    is_enabled can additionally disable within plan
  v_resolved := v_resolved || jsonb_build_object(
    '_meta', jsonb_build_object(
      'module',        p_module,
      'is_enabled',    COALESCE(v_bma.plan_override, v_plan_enabled)
                       AND COALESCE(v_bma.is_enabled, TRUE),
      'template_id',   v_bma.template_id,
      'template_name', v_template_name,
      'has_override',  (v_bma.settings_override IS NOT NULL
                        AND v_bma.settings_override <> '{}')
                       OR (v_branch_cfg <> '{}')
    )
  );

  RETURN v_resolved;
END;
$$;

-- ============================================================
-- FUNCTION: resolve_all_module_configs(branch_id)
-- Returns JSONB keyed by module name for all 13 modules.
-- Single RPC call from the bootstrap API endpoint.
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_all_module_configs(
  p_branch_id UUID
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_result  JSONB := '{}';
  v_module  TEXT;
  v_modules TEXT[] := ARRAY[
    'pos','inventory','repairs','customers','appointments',
    'expenses','employees','reports','messages','invoices',
    'gift_cards','google_reviews','phone'
  ];
BEGIN
  FOREACH v_module IN ARRAY v_modules LOOP
    v_result := v_result || jsonb_build_object(
      v_module,
      public.resolve_module_config(p_branch_id, v_module)
    );
  END LOOP;
  RETURN v_result;
END;
$$;

-- ============================================================
-- DATA MIGRATION
-- Seed default templates and business_module_access from
-- existing plan features. Migrate module_settings data.
-- ============================================================

-- Step 1: Create a default (empty) template for each module.
-- Businesses will inherit from these until superadmin customizes.
INSERT INTO module_config_templates (module, name, description, settings, is_default)
VALUES
  ('pos',           'Default POS',            'Standard point of sale configuration',          '{}', TRUE),
  ('inventory',     'Default Inventory',       'Standard inventory management configuration',   '{}', TRUE),
  ('repairs',       'Default Repairs',         'Standard repair booking configuration',         '{}', TRUE),
  ('customers',     'Default Customers',       'Standard customer management configuration',    '{}', TRUE),
  ('appointments',  'Default Appointments',    'Standard appointments configuration',           '{}', TRUE),
  ('expenses',      'Default Expenses',        'Standard expenses configuration',               '{}', TRUE),
  ('employees',     'Default Employees',       'Standard employee management configuration',    '{}', TRUE),
  ('reports',       'Default Reports',         'Standard reporting configuration',              '{}', TRUE),
  ('messages',      'Default Messages',        'Standard messaging configuration',              '{}', TRUE),
  ('invoices',      'Default Invoices',        'Standard invoicing configuration',              '{}', TRUE),
  ('gift_cards',    'Default Gift Cards',      'Standard gift card configuration',              '{}', TRUE),
  ('google_reviews','Default Google Reviews',  'Standard Google Reviews configuration',         '{}', TRUE),
  ('phone',         'Default Phone',           'Standard phone/WebRTC configuration',           '{}', TRUE)
ON CONFLICT (module, name) DO NOTHING;

-- Step 2: Create business_module_access rows for each business based on their plan features.
INSERT INTO business_module_access (business_id, module, is_enabled, template_id, template_version)
SELECT
  b.id AS business_id,
  m.module,
  TRUE AS is_enabled,
  (SELECT id FROM module_config_templates WHERE module = m.module AND is_default = TRUE) AS template_id,
  1 AS template_version
FROM businesses b
CROSS JOIN LATERAL (
  SELECT jsonb_array_elements_text(
    COALESCE(
      (SELECT p.features
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
        WHERE s.business_id = b.id
          AND s.status IN ('trialing','active','past_due')
        ORDER BY s.created_at DESC
        LIMIT 1),
      '[]'::JSONB
    )
  ) AS module
) AS m
ON CONFLICT (business_id, module) DO NOTHING;

-- Step 3: Migrate existing module_settings into branch_module_overrides.
-- Old table is kept as a compatibility shim until all writes are migrated.
INSERT INTO branch_module_overrides (branch_id, module, settings_override, updated_at)
SELECT branch_id, module, settings, updated_at
FROM module_settings
ON CONFLICT (branch_id, module) DO UPDATE
  SET settings_override = EXCLUDED.settings_override,
      updated_at        = EXCLUDED.updated_at;
