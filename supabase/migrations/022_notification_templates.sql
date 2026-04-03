-- Migration 022: Notification Templates, SMS Gateway Config, Notification Log, Invoice Reminders
-- Phase 8 — Notifications & Communications

-- ─── SMS Gateway + Notification config on businesses ─────────────────────────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS sms_gateway      TEXT CHECK (sms_gateway IN ('twilio', 'textlocal', 'smsglobal')),
  ADD COLUMN IF NOT EXISTS sms_api_key      TEXT,
  ADD COLUMN IF NOT EXISTS sms_api_secret   TEXT,
  ADD COLUMN IF NOT EXISTS sms_sender_id    TEXT,
  ADD COLUMN IF NOT EXISTS email_provider   TEXT DEFAULT 'smtp' CHECK (email_provider IN ('smtp', 'resend', 'ses')),
  ADD COLUMN IF NOT EXISTS email_api_key    TEXT;

-- ─── Notification Templates ──────────────────────────────────────────────────
-- Each template is scoped to a business and a trigger event.
-- channel: which channel(s) fire — email, sms, or both.
-- Macro system: {{customer_name}}, {{ticket_number}}, {{device_model}}, etc.
CREATE TABLE IF NOT EXISTS notification_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT 'email'
                CHECK (channel IN ('email', 'sms', 'both')),
  subject       TEXT,                        -- email subject (macros allowed)
  email_body    TEXT,                        -- HTML email body (macros allowed)
  sms_body      TEXT,                        -- plain text SMS body (macros allowed, 160 char segments)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, trigger_event)
);

-- Supported trigger events (enforced at app level, not as CHECK for extensibility):
-- ticket_created, ticket_status_changed, repair_ready, invoice_created,
-- invoice_overdue, part_arrived, estimate_sent, appointment_reminder,
-- estimate_approved, estimate_declined

CREATE INDEX IF NOT EXISTS idx_notification_templates_business
  ON notification_templates(business_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates_trigger
  ON notification_templates(business_id, trigger_event);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_templates_business_isolation" ON notification_templates
  USING (
    business_id IN (
      SELECT b.id FROM businesses b
      JOIN profiles p ON p.business_id = b.id
      WHERE p.id = auth.uid()
    )
  );

-- ─── Notification Log (audit trail of every sent notification) ───────────────
CREATE TABLE IF NOT EXISTS notification_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  template_id   UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  trigger_event TEXT NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient     TEXT NOT NULL,               -- email address or phone number
  subject       TEXT,                        -- rendered subject
  body          TEXT NOT NULL,               -- rendered body
  status        TEXT NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent', 'failed', 'queued')),
  error_message TEXT,                        -- error details if failed
  related_id    UUID,                        -- FK to the triggering record (repair, invoice, etc.)
  related_type  TEXT,                        -- 'repair', 'invoice', 'estimate', 'appointment'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_business
  ON notification_log(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_related
  ON notification_log(related_id, related_type);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_log_business_isolation" ON notification_log
  USING (
    business_id IN (
      SELECT b.id FROM businesses b
      JOIN profiles p ON p.business_id = b.id
      WHERE p.id = auth.uid()
    )
  );

-- ─── Invoice Payment Reminder Settings ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_reminder_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id           UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  enabled               BOOLEAN NOT NULL DEFAULT false,
  days_before_due       INT NOT NULL DEFAULT 3,    -- send reminder N days before due
  days_after_overdue    INT[] NOT NULL DEFAULT '{1,7,14}',  -- send reminders N days after overdue
  channel               TEXT NOT NULL DEFAULT 'email'
                        CHECK (channel IN ('email', 'sms', 'both')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE invoice_reminder_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_reminder_settings_business_isolation" ON invoice_reminder_settings
  USING (
    business_id IN (
      SELECT b.id FROM businesses b
      JOIN profiles p ON p.business_id = b.id
      WHERE p.id = auth.uid()
    )
  );

-- ─── Seed default notification templates function ────────────────────────────
-- Called when a new business is created to give them starter templates.
CREATE OR REPLACE FUNCTION seed_notification_templates(p_business_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO notification_templates (business_id, trigger_event, channel, subject, email_body, sms_body) VALUES
    (p_business_id, 'ticket_created', 'email',
     'Repair Ticket Created: {{ticket_number}}',
     '<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2>Repair Ticket Created</h2><p>Hi {{customer_name}},</p><p>Your repair ticket <strong>{{ticket_number}}</strong> for <em>{{device_model}}</em> has been created.</p><p>We''ll keep you updated on the status. Thank you for choosing {{store_name}}.</p></div>',
     'Hi {{customer_name}}, your repair ticket {{ticket_number}} for {{device_model}} has been created. We''ll keep you updated. — {{store_name}}'),

    (p_business_id, 'ticket_status_changed', 'email',
     'Repair Update: {{ticket_number}} — {{status}}',
     '<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2>Repair Status Update</h2><p>Hi {{customer_name}},</p><p>Your repair job <strong>{{ticket_number}}</strong> for <em>{{device_model}}</em> has been updated:</p><div style="background:#f0f4ff;border-radius:8px;padding:16px;margin:16px 0"><strong style="font-size:18px">{{status}}</strong></div>{{#note}}<p><strong>Note:</strong> {{note}}</p>{{/note}}<p>Thank you for choosing {{store_name}}.</p></div>',
     'Hi {{customer_name}}, your repair {{ticket_number}} status: {{status}}. {{note}} — {{store_name}}'),

    (p_business_id, 'repair_ready', 'both',
     'Your Repair is Ready: {{ticket_number}}',
     '<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2>Repair Complete!</h2><p>Hi {{customer_name}},</p><p>Great news! Your device <em>{{device_model}}</em> (ticket <strong>{{ticket_number}}</strong>) is repaired and ready for collection.</p><p>Please visit us at your earliest convenience.</p><p>Thank you for choosing {{store_name}}.</p></div>',
     'Hi {{customer_name}}, your repair {{ticket_number}} is ready for collection! — {{store_name}}'),

    (p_business_id, 'invoice_created', 'email',
     'Invoice {{invoice_number}} from {{store_name}}',
     '<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2>New Invoice</h2><p>Hi {{customer_name}},</p><p>Invoice <strong>{{invoice_number}}</strong> for <strong>{{currency}}{{total}}</strong> has been created.</p><p>Due date: {{due_date}}</p><p>Thank you for your business. — {{store_name}}</p></div>',
     'Hi {{customer_name}}, invoice {{invoice_number}} for {{currency}}{{total}} is ready. Due: {{due_date}}. — {{store_name}}'),

    (p_business_id, 'invoice_overdue', 'email',
     'Overdue Invoice Reminder: {{invoice_number}}',
     '<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2>Payment Reminder</h2><p>Hi {{customer_name}},</p><p>This is a friendly reminder that invoice <strong>{{invoice_number}}</strong> for <strong>{{currency}}{{balance_due}}</strong> was due on {{due_date}}.</p><p>Please arrange payment at your earliest convenience.</p><p>Thank you. — {{store_name}}</p></div>',
     'Hi {{customer_name}}, invoice {{invoice_number}} for {{currency}}{{balance_due}} is overdue. Please pay soon. — {{store_name}}'),

    (p_business_id, 'estimate_sent', 'email',
     'Repair Estimate: {{ticket_number}}',
     '<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2>Repair Estimate</h2><p>Hi {{customer_name}},</p><p>We''ve prepared an estimate for your repair <strong>{{ticket_number}}</strong>:</p><div style="background:#f0f4ff;border-radius:8px;padding:16px;margin:16px 0"><strong style="font-size:18px">{{currency}}{{estimate_total}}</strong></div><p>Please review and let us know if you''d like to proceed.</p><p>Thank you for choosing {{store_name}}.</p></div>',
     'Hi {{customer_name}}, your repair estimate for {{ticket_number}}: {{currency}}{{estimate_total}}. Reply to approve. — {{store_name}}'),

    (p_business_id, 'part_arrived', 'both',
     'Part Arrived for Your Repair: {{ticket_number}}',
     '<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2>Part Has Arrived</h2><p>Hi {{customer_name}},</p><p>The part for your repair <strong>{{ticket_number}}</strong> ({{device_model}}) has arrived. We''ll begin work shortly.</p><p>Thank you for your patience. — {{store_name}}</p></div>',
     'Hi {{customer_name}}, the part for your repair {{ticket_number}} has arrived. We''ll begin work shortly. — {{store_name}}'),

    (p_business_id, 'appointment_reminder', 'both',
     'Appointment Reminder — {{appointment_date}}',
     '<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2>Appointment Reminder</h2><p>Hi {{customer_name}},</p><p>This is a reminder of your appointment on <strong>{{appointment_date}}</strong> at <strong>{{appointment_time}}</strong>.</p><p>See you then! — {{store_name}}</p></div>',
     'Hi {{customer_name}}, reminder: your appointment is on {{appointment_date}} at {{appointment_time}}. — {{store_name}}')

  ON CONFLICT (business_id, trigger_event) DO NOTHING;
END;
$$;

-- ─── Add SMS sent tracking to repair_status_history ──────────────────────────
ALTER TABLE repair_status_history
  ADD COLUMN IF NOT EXISTS sms_sent BOOLEAN DEFAULT false;
