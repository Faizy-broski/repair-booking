-- Migration 160: Robust backfill for the pricing-details email bodies.
--
-- Migration 159's backfill used REPLACE() against an exact fingerprint of the old
-- default body — that's fragile (whitespace/quoting differences meant some rows
-- were silently skipped, confirmed via debug logging showing
-- templateHasPricingMacro: false even after re-running 159).
--
-- This migration instead does a full overwrite of email_body for any row that
-- still lacks {{total_cost}}, using the exact same content the (updated) seed
-- function inserts for new businesses. Dollar-quoted strings avoid the SQL
-- single-quote escaping that made the previous fingerprint brittle.
--
-- Only rows still missing {{total_cost}} are touched — templates that already
-- have the pricing section (from a successful 159 backfill or a fresh seed)
-- are left alone.

UPDATE notification_templates
SET
  email_body = $body$<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
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
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:0 0 20px;display:flex;justify-content:space-between;align-items:center;">
  <span style="font-size:13px;color:#166534;font-weight:600;">Balance Due</span>
  <span style="font-size:18px;color:#166534;font-weight:800;">{{balance_due}}</span>
</div>
<p style="margin:0;font-size:14px;color:#6b7280;">We'll keep you updated on the progress. Thank you for choosing <strong>{{store_name}}</strong>.</p>$body$,
  updated_at = NOW()
WHERE trigger_event = 'ticket_created'
  AND email_body NOT LIKE '%{{total_cost}}%';

UPDATE notification_templates
SET
  email_body = $body$<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
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
    <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;"><span style="display:inline-block;background:#dbeafe;color:#1e40af;font-weight:700;font-size:13px;padding:4px 12px;border-radius:20px;">{{status}}</span></td>
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
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:0 0 20px;display:flex;justify-content:space-between;align-items:center;">
  <span style="font-size:13px;color:#166534;font-weight:600;">Balance Due</span>
  <span style="font-size:18px;color:#166534;font-weight:800;">{{balance_due}}</span>
</div>
{{#note}}<div style="background:#fefce8;border-left:3px solid #eab308;padding:12px 16px;margin:0 0 24px;border-radius:0 6px 6px 0;font-size:14px;color:#713f12;"><strong>Note:</strong> {{note}}</div>{{/note}}
<p style="margin:0;font-size:14px;color:#6b7280;">Thank you for choosing <strong>{{store_name}}</strong>.</p>$body$,
  updated_at = NOW()
WHERE trigger_event = 'ticket_status_changed'
  AND email_body NOT LIKE '%{{total_cost}}%';

UPDATE notification_templates
SET
  email_body = $body$<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>
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
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:0 0 20px;display:flex;justify-content:space-between;align-items:center;">
  <span style="font-size:13px;color:#166534;font-weight:600;">Balance Due</span>
  <span style="font-size:18px;color:#166534;font-weight:800;">{{balance_due}}</span>
</div>
<p style="margin:0 0 8px;font-size:14px;color:#374151;">Please visit us at your earliest convenience to collect your device.</p>
<p style="margin:0;font-size:14px;color:#6b7280;">Thank you for choosing <strong>{{store_name}}</strong>.</p>$body$,
  updated_at = NOW()
WHERE trigger_event = 'repair_ready'
  AND email_body NOT LIKE '%{{total_cost}}%';
