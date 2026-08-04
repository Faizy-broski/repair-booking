-- Per-receipt visibility scope for policy_text, matching the existing
-- footer_line_1/2/3_scope columns, so the Terms/Policy block can be limited
-- to repair receipts, POS receipts, or both. Defaults to 'both'.
ALTER TABLE invoice_settings
  ADD COLUMN policy_text_scope TEXT NOT NULL DEFAULT 'both' CHECK (policy_text_scope IN ('both', 'repair', 'pos'));
