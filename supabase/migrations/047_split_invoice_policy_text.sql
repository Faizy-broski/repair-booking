-- ── Split invoice "Terms & Conditions" into POS-only and Repair-only text ───
-- Previously a single `policy_text` field with a `policy_text_scope`
-- ('both'|'pos'|'repair') toggle controlled which invoice types showed it —
-- but that meant POS and repair invoices could only ever show the exact same
-- wording (or one of them show none at all), never two different terms at
-- the same time. Splitting into two independent free-text columns lets a
-- business keep separate terms for each document type simultaneously.
--
-- Existing content is preserved by backfilling both new columns from the old
-- value according to whatever scope was already set, so no business loses
-- terms text they'd already configured.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_settings' AND column_name = 'policy_text'
  ) THEN
    ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS policy_text_pos TEXT;
    ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS policy_text_repair TEXT;

    UPDATE invoice_settings
    SET policy_text_pos = policy_text
    WHERE policy_text IS NOT NULL
      AND COALESCE(policy_text_scope, 'both') IN ('both', 'pos');

    UPDATE invoice_settings
    SET policy_text_repair = policy_text
    WHERE policy_text IS NOT NULL
      AND COALESCE(policy_text_scope, 'both') IN ('both', 'repair');

    ALTER TABLE invoice_settings DROP COLUMN policy_text;
    ALTER TABLE invoice_settings DROP COLUMN IF EXISTS policy_text_scope;
  ELSE
    ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS policy_text_pos TEXT;
    ALTER TABLE invoice_settings ADD COLUMN IF NOT EXISTS policy_text_repair TEXT;
  END IF;
END $$;
