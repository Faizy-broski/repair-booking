-- ============================================================
-- 004_seed.sql
-- Seed data: default plans, expense categories
-- ============================================================

-- Default subscription plans
INSERT INTO plans (name, price_monthly, price_yearly, max_branches, max_users, features) VALUES
  ('Starter',    29.99,  299.00,  1,  5,  '["pos","inventory","repairs","reports"]'),
  ('Pro',        79.99,  799.00,  5,  20, '["pos","inventory","repairs","reports","messaging","appointments","expenses","employees","gift_cards"]'),
  ('Enterprise', 199.99, 1999.00, 50, 999,'["pos","inventory","repairs","reports","messaging","appointments","expenses","employees","gift_cards","google_reviews","phone","custom_fields"]')
ON CONFLICT DO NOTHING;
