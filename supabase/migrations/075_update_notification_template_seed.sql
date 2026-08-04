-- Migration 075: Update notification template seed with rich HTML (device_type, device_brand, issue macros)
-- Templates now produce only the inner content HTML — the email shell (logo, header, footer)
-- is injected by the app's wrapInEmailShell() function at send time.

CREATE OR REPLACE FUNCTION seed_notification_templates(p_business_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO notification_templates (business_id, trigger_event, channel, subject, email_body, sms_body) VALUES

    (p_business_id, 'ticket_created', 'email',
     'Repair Ticket Created: {{ticket_number}}',
     '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
<p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Your repair ticket has been created. Here are the details:</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Ticket #</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{ticket_number}}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Device</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_type}} {{device_brand}} {{device_model}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Issue</td>
    <td style="padding:10px 14px;color:#374151;">{{issue}}</td>
  </tr>
</table>
<p style="margin:0;font-size:14px;color:#6b7280;">We''ll keep you updated on the progress. Thank you for choosing <strong>{{store_name}}</strong>.</p>',
     'Hi {{customer_name}}, your repair ticket {{ticket_number}} for {{device_type}} {{device_brand}} {{device_model}} has been created. Issue: {{issue}}. We''ll keep you updated. — {{store_name}}'),

    (p_business_id, 'ticket_status_changed', 'email',
     'Repair Update: {{ticket_number}} — {{status}}',
     '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
<p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Your repair has been updated. Here are the current details:</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Ticket #</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{ticket_number}}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Device</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_type}} {{device_brand}} {{device_model}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Issue</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{issue}}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Status</td>
    <td style="padding:10px 14px;"><span style="display:inline-block;background:#dbeafe;color:#1e40af;font-weight:700;font-size:13px;padding:4px 12px;border-radius:20px;">{{status}}</span></td>
  </tr>
</table>
{{#note}}<div style="background:#fefce8;border-left:3px solid #eab308;padding:12px 16px;margin:0 0 24px;border-radius:0 6px 6px 0;font-size:14px;color:#713f12;"><strong>Note:</strong> {{note}}</div>{{/note}}
<p style="margin:0;font-size:14px;color:#6b7280;">Thank you for choosing <strong>{{store_name}}</strong>.</p>',
     'Hi {{customer_name}}, your repair {{ticket_number}} status: {{status}}. {{note}} — {{store_name}}'),

    (p_business_id, 'repair_ready', 'both',
     'Your Repair is Ready: {{ticket_number}}',
     '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;margin:0 0 24px;text-align:center;">
  <p style="margin:0 0 6px;font-size:24px;">&#10003;</p>
  <p style="margin:0;font-size:18px;font-weight:700;color:#166534;">Your repair is ready!</p>
</div>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Ticket #</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{ticket_number}}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Device</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_type}} {{device_brand}} {{device_model}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Issue Fixed</td>
    <td style="padding:10px 14px;color:#374151;">{{issue}}</td>
  </tr>
</table>
<p style="margin:0 0 8px;font-size:14px;color:#374151;">Please visit us at your earliest convenience to collect your device.</p>
<p style="margin:0;font-size:14px;color:#6b7280;">Thank you for choosing <strong>{{store_name}}</strong>.</p>',
     'Hi {{customer_name}}, your repair {{ticket_number}} for {{device_brand}} {{device_model}} is ready for collection! — {{store_name}}'),

    (p_business_id, 'invoice_created', 'email',
     'Invoice {{invoice_number}} from {{store_name}}',
     '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
<p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">A new invoice has been created for your account:</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Invoice #</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{invoice_number}}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Total</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{currency}}{{total}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Due Date</td>
    <td style="padding:10px 14px;color:#374151;">{{due_date}}</td>
  </tr>
</table>
<p style="margin:0;font-size:14px;color:#6b7280;">Thank you for your business. — <strong>{{store_name}}</strong></p>',
     'Hi {{customer_name}}, invoice {{invoice_number}} for {{currency}}{{total}} is ready. Due: {{due_date}}. — {{store_name}}'),

    (p_business_id, 'invoice_overdue', 'email',
     'Overdue Invoice Reminder: {{invoice_number}}',
     '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
  <p style="margin:0;font-size:14px;color:#991b1b;font-weight:600;">Payment Overdue</p>
  <p style="margin:4px 0 0;font-size:13px;color:#b91c1c;">Invoice {{invoice_number}} was due on {{due_date}}.</p>
</div>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Invoice #</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{invoice_number}}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Balance Due</td>
    <td style="padding:10px 14px;font-weight:700;color:#dc2626;">{{currency}}{{balance_due}}</td>
  </tr>
</table>
<p style="margin:0;font-size:14px;color:#6b7280;">Please arrange payment at your earliest convenience. Thank you. — <strong>{{store_name}}</strong></p>',
     'Hi {{customer_name}}, invoice {{invoice_number}} for {{currency}}{{balance_due}} is overdue (due {{due_date}}). Please pay soon. — {{store_name}}'),

    (p_business_id, 'estimate_sent', 'email',
     'Repair Estimate: {{ticket_number}}',
     '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
<p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">We''ve prepared an estimate for your repair:</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Ticket #</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{ticket_number}}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Device</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_type}} {{device_brand}} {{device_model}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Estimate</td>
    <td style="padding:10px 14px;font-weight:700;color:#374151;font-size:18px;">{{currency}}{{estimate_total}}</td>
  </tr>
</table>
<p style="margin:0;font-size:14px;color:#6b7280;">Please review and let us know if you''d like to proceed. Thank you for choosing <strong>{{store_name}}</strong>.</p>',
     'Hi {{customer_name}}, your repair estimate for {{ticket_number}}: {{currency}}{{estimate_total}}. Reply to approve. — {{store_name}}'),

    (p_business_id, 'part_arrived', 'both',
     'Part Arrived for Your Repair: {{ticket_number}}',
     '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
<p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Good news! The part for your repair has arrived and we''ll begin work shortly.</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Ticket #</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{ticket_number}}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Device</td>
    <td style="padding:10px 14px;color:#374151;">{{device_type}} {{device_brand}} {{device_model}}</td>
  </tr>
</table>
<p style="margin:0;font-size:14px;color:#6b7280;">Thank you for your patience. — <strong>{{store_name}}</strong></p>',
     'Hi {{customer_name}}, the part for your repair {{ticket_number}} has arrived. We''ll begin work shortly. — {{store_name}}'),

    (p_business_id, 'appointment_reminder', 'both',
     'Appointment Reminder — {{appointment_date}}',
     '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
<p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">This is a friendly reminder about your upcoming appointment:</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Date</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{appointment_date}}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Time</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;"><strong>{{appointment_time}}</strong></td>
  </tr>
</table>
<p style="margin:0;font-size:14px;color:#6b7280;">See you then! — <strong>{{store_name}}</strong></p>',
     'Hi {{customer_name}}, reminder: your appointment is on {{appointment_date}} at {{appointment_time}}. — {{store_name}}')

  ON CONFLICT (business_id, trigger_event) DO NOTHING;
END;
$$;

-- Update existing stored templates for all businesses so they use the new rich HTML.
-- We overwrite only the system templates (matching the old plain-div defaults).
-- Businesses that have customised their templates will keep their custom content.

UPDATE notification_templates SET
  subject    = 'Repair Ticket Created: {{ticket_number}}',
  email_body = '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
<p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Your repair ticket has been created. Here are the details:</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Ticket #</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{ticket_number}}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Device</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_type}} {{device_brand}} {{device_model}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Issue</td>
    <td style="padding:10px 14px;color:#374151;">{{issue}}</td>
  </tr>
</table>
<p style="margin:0;font-size:14px;color:#6b7280;">We''ll keep you updated on the progress. Thank you for choosing <strong>{{store_name}}</strong>.</p>',
  updated_at = NOW()
WHERE trigger_event = 'ticket_created'
  AND email_body LIKE '%Your repair ticket%{{ticket_number}}%has been created%';

UPDATE notification_templates SET
  subject    = 'Repair Update: {{ticket_number}} — {{status}}',
  email_body = '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
<p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Your repair has been updated. Here are the current details:</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Ticket #</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{ticket_number}}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Device</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_type}} {{device_brand}} {{device_model}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Issue</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{issue}}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Status</td>
    <td style="padding:10px 14px;"><span style="display:inline-block;background:#dbeafe;color:#1e40af;font-weight:700;font-size:13px;padding:4px 12px;border-radius:20px;">{{status}}</span></td>
  </tr>
</table>
{{#note}}<div style="background:#fefce8;border-left:3px solid #eab308;padding:12px 16px;margin:0 0 24px;border-radius:0 6px 6px 0;font-size:14px;color:#713f12;"><strong>Note:</strong> {{note}}</div>{{/note}}
<p style="margin:0;font-size:14px;color:#6b7280;">Thank you for choosing <strong>{{store_name}}</strong>.</p>',
  updated_at = NOW()
WHERE trigger_event = 'ticket_status_changed'
  AND email_body LIKE '%Repair Status Update%';

UPDATE notification_templates SET
  subject    = 'Your Repair is Ready: {{ticket_number}}',
  email_body = '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px 24px;margin:0 0 24px;text-align:center;">
  <p style="margin:0 0 6px;font-size:24px;">&#10003;</p>
  <p style="margin:0;font-size:18px;font-weight:700;color:#166534;">Your repair is ready!</p>
</div>
<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Ticket #</td>
    <td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{ticket_number}}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Device</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_type}} {{device_brand}} {{device_model}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Issue Fixed</td>
    <td style="padding:10px 14px;color:#374151;">{{issue}}</td>
  </tr>
</table>
<p style="margin:0 0 8px;font-size:14px;color:#374151;">Please visit us at your earliest convenience to collect your device.</p>
<p style="margin:0;font-size:14px;color:#6b7280;">Thank you for choosing <strong>{{store_name}}</strong>.</p>',
  updated_at = NOW()
WHERE trigger_event = 'repair_ready'
  AND email_body LIKE '%Repair Complete%';
