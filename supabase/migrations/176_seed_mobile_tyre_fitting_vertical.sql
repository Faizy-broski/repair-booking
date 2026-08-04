-- ============================================================================
-- 176 — Seed "Mobile Tyre Fitting" business vertical template
-- ============================================================================

INSERT INTO business_vertical_templates (name, slug, description, icon, modules_enabled, module_settings, sort_order)
VALUES
  (
    'Mobile Tyre Fitting',
    'mobile-tyre-fitting',
    'Roadside / mobile tyre-fitting businesses — phone call-in booking, dispatch, and invoicing for stranded vehicles',
    'truck',
    ARRAY['pos', 'inventory', 'repairs', 'customers', 'invoices', 'employees', 'expenses', 'reports'],
    '{
      "repairs": {
        "statuses": [
          {"key": "received",    "label": "Booked",      "color": "#2563eb"},
          {"key": "in_progress", "label": "In Progress",  "color": "#d97706"},
          {"key": "repaired",    "label": "Completed",   "color": "#16a34a"},
          {"key": "collected",   "label": "Invoiced",    "color": "#6b7280"}
        ],
        "require_deposit": false,
        "sms_on_status_change": false
      },
      "customers": {"required_fields": ["phone"]},
      "inventory": {"low_stock_threshold": 8, "track_serial_numbers": false},
      "pos": {"tax_rate": 0.20, "tax_label": "VAT", "require_customer": true}
    }'::jsonb,
    7
  )
ON CONFLICT (slug) DO NOTHING;
