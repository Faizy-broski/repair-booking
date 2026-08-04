-- ============================================================================
-- 089 — Vertical Template Versioning
-- ============================================================================
-- Adds two things:
--   1. business_vertical_templates.version  — increments each time a template
--      is edited so you can tell "retail-store is now v3"
--   2. businesses.vertical_template_version — snapshot of which version was
--      last applied to each business so you can query "who is behind?"
--
-- Fully backward-compatible:
--   • Existing templates get version = 1 (already seeded)
--   • Existing businesses get vertical_template_version = NULL
--     (NULL = "applied before versioning existed")
-- ============================================================================

-- ── 1. Template version counter ───────────────────────────────────────────────

ALTER TABLE business_vertical_templates
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

COMMENT ON COLUMN business_vertical_templates.version IS
  'Monotonically incrementing version. Bump this every time modules_enabled or module_settings changes.';

-- ── 2. Per-business applied version snapshot ──────────────────────────────────

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS vertical_template_version INT;

COMMENT ON COLUMN businesses.vertical_template_version IS
  'Version of the vertical template that was last applied to this business.
   NULL = applied before versioning was introduced.
   Compare against business_vertical_templates.version to detect drift.';

-- ── 3. Helper view: businesses behind the current template version ────────────
-- Queryable via: SELECT * FROM vw_template_version_drift WHERE slug = 'retail-store'

CREATE OR REPLACE VIEW vw_template_version_drift AS
SELECT
  b.id                            AS business_id,
  b.name                          AS business_name,
  b.subdomain,
  b.vertical_template_version     AS applied_version,
  t.version                       AS current_version,
  t.version - COALESCE(b.vertical_template_version, 0) AS versions_behind,
  t.id                            AS template_id,
  t.name                          AS template_name,
  t.slug                          AS template_slug
FROM businesses b
JOIN business_vertical_templates t ON t.id = b.vertical_template_id
WHERE b.is_active = true;

COMMENT ON VIEW vw_template_version_drift IS
  'Shows every active business alongside their applied template version vs current.
   versions_behind > 0 means the business needs a push to be up-to-date.';
