-- Per-line visibility scope for footer_line_1/2/3, so a tenant can choose
-- whether each free-text footer line prints on repair receipts, POS sale
-- receipts, or both. Defaults to 'both' so existing receipts are unaffected
-- until a tenant explicitly narrows a line's scope.
ALTER TABLE invoice_settings
  ADD COLUMN footer_line_1_scope TEXT NOT NULL DEFAULT 'both' CHECK (footer_line_1_scope IN ('both', 'repair', 'pos')),
  ADD COLUMN footer_line_2_scope TEXT NOT NULL DEFAULT 'both' CHECK (footer_line_2_scope IN ('both', 'repair', 'pos')),
  ADD COLUMN footer_line_3_scope TEXT NOT NULL DEFAULT 'both' CHECK (footer_line_3_scope IN ('both', 'repair', 'pos'));
