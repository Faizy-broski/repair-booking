-- ============================================================================
-- 093 — Per-tenant brand color
-- ============================================================================
-- Allows each business owner to pick a custom brand color in Settings,
-- replacing the platform default teal wherever it's used (sidebar, buttons,
-- accents, customer-facing booking widget).
-- ============================================================================

ALTER TABLE businesses
  ADD COLUMN brand_color TEXT NOT NULL DEFAULT '#008080'
  CONSTRAINT businesses_brand_color_format CHECK (brand_color ~ '^#[0-9A-Fa-f]{6}$');
