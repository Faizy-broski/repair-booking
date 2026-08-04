-- Extend sales.payment_method CHECK to allow custom per-business channel names.
-- eBay, Deliveroo and Website are used by Riseteck only; the constraint is
-- permissive (allows the value) but the UI only surfaces these channels when
-- the business has custom_payment_channels configured in business_module_access.
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN (
    'cash', 'card', 'voucher', 'gift_card', 'split', 'on_account',
    'ebay', 'deliveroo', 'website'
  ));

-- Seed Riseteck's POS module settings with custom payment channels.
-- Resolved via the owner's email so no hard-coded UUIDs are needed.
INSERT INTO business_module_access (business_id, module, is_enabled, settings_override)
SELECT
  b.id,
  'pos',
  true,
  jsonb_build_object('custom_payment_channels', jsonb_build_array('ebay', 'deliveroo', 'website'))
FROM businesses b
JOIN profiles p ON p.business_id = b.id
WHERE p.email = 'saram@riseteck.com'
  AND p.role = 'business_owner'
LIMIT 1
ON CONFLICT (business_id, module) DO UPDATE
  SET settings_override =
    COALESCE(business_module_access.settings_override, '{}'::jsonb)
    || jsonb_build_object('custom_payment_channels', jsonb_build_array('ebay', 'deliveroo', 'website'));
