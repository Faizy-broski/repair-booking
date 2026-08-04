-- Invoice display & branding settings
-- Supports a business-wide default (branch_id IS NULL) and per-branch overrides.

CREATE TABLE invoice_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id             UUID REFERENCES branches(id) ON DELETE CASCADE,   -- NULL = business default

  -- Page layout
  paper_size            TEXT NOT NULL DEFAULT 'A4'
                          CHECK (paper_size IN ('A4','A5','Letter','Receipt80','Receipt58')),
  orientation           TEXT NOT NULL DEFAULT 'portrait'
                          CHECK (orientation IN ('portrait','landscape')),

  -- Branding
  logo_url              TEXT,
  primary_color         TEXT NOT NULL DEFAULT '#0f766e',
  secondary_color       TEXT NOT NULL DEFAULT '#f0fdfa',
  text_color            TEXT NOT NULL DEFAULT '#111827',
  font_family           TEXT NOT NULL DEFAULT 'Helvetica',

  -- Header toggles
  show_logo             BOOLEAN NOT NULL DEFAULT true,
  show_business_name    BOOLEAN NOT NULL DEFAULT true,
  show_branch_name      BOOLEAN NOT NULL DEFAULT true,
  show_address          BOOLEAN NOT NULL DEFAULT true,
  show_phone            BOOLEAN NOT NULL DEFAULT true,
  show_email            BOOLEAN NOT NULL DEFAULT true,

  -- Footer content
  footer_line_1         TEXT,
  footer_line_2         TEXT,
  footer_line_3         TEXT,
  thank_you_message     TEXT DEFAULT 'Thank you for your business!',
  policy_text           TEXT,

  -- Social links  { website, facebook, instagram, twitter, whatsapp, tiktok }
  social_links          JSONB NOT NULL DEFAULT '{}',

  -- Display options
  show_tax_breakdown    BOOLEAN NOT NULL DEFAULT true,
  show_payment_method   BOOLEAN NOT NULL DEFAULT false,
  show_unpaid_watermark BOOLEAN NOT NULL DEFAULT true,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Business-wide default: at most one row per business with branch_id IS NULL
CREATE UNIQUE INDEX invoice_settings_business_default
  ON invoice_settings (business_id)
  WHERE branch_id IS NULL;

-- Per-branch override: at most one row per (business, branch) pair
CREATE UNIQUE INDEX invoice_settings_branch
  ON invoice_settings (business_id, branch_id)
  WHERE branch_id IS NOT NULL;

ALTER TABLE invoice_settings ENABLE ROW LEVEL SECURITY;

-- Business members can read/write their own settings
CREATE POLICY "business_members_invoice_settings"
  ON invoice_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.business_id = invoice_settings.business_id
    )
  );
