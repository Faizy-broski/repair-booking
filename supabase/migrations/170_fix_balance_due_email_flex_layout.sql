-- Migration 170: Fix "Balance Due" row in repair notification emails rendering with no
-- gap between the label and the amount (e.g. "Balance Due£60.00").
--
-- Root cause: the Balance Due box used `display:flex;justify-content:space-between`
-- inside the raw HTML email body. Most email clients (Outlook desktop, many mobile
-- mail apps) don't support flexbox, so it collapses to a single line with no space.
-- Fixed by switching to a table-based layout, which is the standard bulletproof
-- approach for HTML email and matches every other row in these templates.

-- ── 1. Update seed function so new businesses get the fixed layout ──

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
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Brand</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_brand}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Model</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_model}}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Issue</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{issue}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Total Cost</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{total_cost}}</td>
  </tr>
  {{#discount}}<tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Discount</td>
    <td style="padding:10px 14px;color:#10b981;border-bottom:1px solid #e5e7eb;">-{{discount}}</td>
  </tr>{{/discount}}
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Deposit Paid</td>
    <td style="padding:10px 14px;color:#374151;">{{deposit_paid}}</td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:0 0 20px;"><tr>
  <td style="padding:12px 16px;font-size:13px;color:#166534;font-weight:600;">Balance Due</td>
  <td style="padding:12px 16px;font-size:18px;color:#166534;font-weight:800;text-align:right;">{{balance_due}}</td>
</tr></table>
<p style="margin:0;font-size:14px;color:#6b7280;">We''ll keep you updated on the progress. Thank you for choosing <strong>{{store_name}}</strong>.</p>',
     'Hi {{customer_name}}, your repair ticket {{ticket_number}} for {{device_brand}} {{device_model}} has been created. Issue: {{issue}}. Total: {{total_cost}}, Balance Due: {{balance_due}}. We''ll keep you updated. — {{store_name}}'),

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
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Brand</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_brand}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Model</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_model}}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Issue</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{issue}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Status</td>
    <td style="padding:10px 14px;"><span style="display:inline-block;background:#dbeafe;color:#1e40af;font-weight:700;font-size:13px;padding:4px 12px;border-radius:20px;">{{status}}</span></td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Total Cost</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{total_cost}}</td>
  </tr>
  {{#discount}}<tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Discount</td>
    <td style="padding:10px 14px;color:#10b981;border-bottom:1px solid #e5e7eb;">-{{discount}}</td>
  </tr>{{/discount}}
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Deposit Paid</td>
    <td style="padding:10px 14px;color:#374151;">{{deposit_paid}}</td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:0 0 20px;"><tr>
  <td style="padding:12px 16px;font-size:13px;color:#166534;font-weight:600;">Balance Due</td>
  <td style="padding:12px 16px;font-size:18px;color:#166534;font-weight:800;text-align:right;">{{balance_due}}</td>
</tr></table>
{{#note}}<div style="background:#fefce8;border-left:3px solid #eab308;padding:12px 16px;margin:0 0 24px;border-radius:0 6px 6px 0;font-size:14px;color:#713f12;"><strong>Note:</strong> {{note}}</div>{{/note}}
<p style="margin:0;font-size:14px;color:#6b7280;">Thank you for choosing <strong>{{store_name}}</strong>.</p>',
     'Hi {{customer_name}}, your repair {{ticket_number}} status: {{status}}. Balance Due: {{balance_due}}. {{note}} — {{store_name}}'),

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
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Brand</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_brand}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Model</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_model}}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Issue Fixed</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{issue}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Total Cost</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{total_cost}}</td>
  </tr>
  {{#discount}}<tr>
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Discount</td>
    <td style="padding:10px 14px;color:#10b981;border-bottom:1px solid #e5e7eb;">-{{discount}}</td>
  </tr>{{/discount}}
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Deposit Paid</td>
    <td style="padding:10px 14px;color:#374151;">{{deposit_paid}}</td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:0 0 20px;"><tr>
  <td style="padding:12px 16px;font-size:13px;color:#166534;font-weight:600;">Balance Due</td>
  <td style="padding:12px 16px;font-size:18px;color:#166534;font-weight:800;text-align:right;">{{balance_due}}</td>
</tr></table>
<p style="margin:0 0 8px;font-size:14px;color:#374151;">Please visit us at your earliest convenience to collect your device.</p>
<p style="margin:0;font-size:14px;color:#6b7280;">Thank you for choosing <strong>{{store_name}}</strong>.</p>',
     'Hi {{customer_name}}, your repair {{ticket_number}} for {{device_brand}} {{device_model}} is ready for collection! Balance Due: {{balance_due}}. — {{store_name}}'),

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
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Brand</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_brand}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Model</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_model}}</td>
  </tr>
  <tr>
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
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Brand</td>
    <td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{device_brand}}</td>
  </tr>
  <tr style="background:#f8fafc;">
    <td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Model</td>
    <td style="padding:10px 14px;color:#374151;">{{device_model}}</td>
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

-- ── 2. Fix already-seeded templates in place ──
-- The old flex-based Balance Due box is a byte-identical substring across all three
-- repair templates, so a single REPLACE() per row fixes every occurrence in that row.
-- Rows a business has customized to no longer contain the old substring are untouched.

UPDATE notification_templates
SET
  email_body = REPLACE(
    email_body,
    '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:0 0 20px;display:flex;justify-content:space-between;align-items:center;">
  <span style="font-size:13px;color:#166534;font-weight:600;">Balance Due</span>
  <span style="font-size:18px;color:#166534;font-weight:800;">{{balance_due}}</span>
</div>',
    '<table style="width:100%;border-collapse:collapse;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin:0 0 20px;"><tr>
  <td style="padding:12px 16px;font-size:13px;color:#166534;font-weight:600;">Balance Due</td>
  <td style="padding:12px 16px;font-size:18px;color:#166534;font-weight:800;text-align:right;">{{balance_due}}</td>
</tr></table>'
  ),
  updated_at = NOW()
WHERE trigger_event IN ('ticket_created', 'ticket_status_changed', 'repair_ready')
  AND email_body LIKE '%display:flex;justify-content:space-between;align-items:center;%Balance Due%';
