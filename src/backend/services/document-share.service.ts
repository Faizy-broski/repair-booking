import { ShortLinkService } from '@/backend/services/short-link.service'
import { NotificationTemplateService } from '@/backend/services/notification-template.service'
import { NotificationEngine } from '@/backend/services/notification-engine.service'

// wa.me links are opened by the customer at an unknown later time, so the PDF's
// signed URL needs to outlive the normal 10-minute in-app preview TTL.
export const WHATSAPP_PDF_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

// Wraps a long signed URL (Supabase Storage signed URLs carry a big JWT token)
// behind a short /s/{code} redirect — much friendlier in a WhatsApp message or
// email body. Expires alongside the URL it points to. Falls back to the raw
// URL if short-link creation fails for any reason (never block a send over this).
export async function shortenUrl(targetUrl: string, businessId: string, ttlSeconds: number): Promise<string> {
  try {
    const code = await ShortLinkService.create(targetUrl, businessId, new Date(Date.now() + ttlSeconds * 1000))
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://repairbooking.co.uk'
    return `${appUrl}/s/${code}`
  } catch (err) {
    console.error('[shortenUrl] Failed to create short link, falling back to raw URL:', err)
    return targetUrl
  }
}

// Ensure this business has an active "invoice_created" template — most
// businesses never visit Settings to create one, so NotificationEngine.fire
// would otherwise silently no-op. Seeds a sensible default the first time.
export async function ensureInvoiceCreatedTemplate(businessId: string) {
  let template = await NotificationTemplateService.getByTrigger(businessId, 'invoice_created')
  if (!template) {
    template = await NotificationTemplateService.upsert(businessId, {
      trigger_event: 'invoice_created',
      channel: 'email',
      subject: 'Your Invoice {{invoice_number}} from {{store_name}}',
      email_body:
        '<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi <strong>{{customer_name}}</strong>,</p>' +
        '<p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">Here is your invoice from {{store_name}}.</p>' +
        '<table style="width:100%;border-collapse:collapse;margin:0 0 24px;font-size:14px;">' +
        '<tr style="background:#f8fafc;"><td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Invoice #</td>' +
        '<td style="padding:10px 14px;font-weight:700;color:#111827;border-bottom:1px solid #e5e7eb;"><strong>{{invoice_number}}</strong></td></tr>' +
        '<tr><td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;white-space:nowrap;">Total</td>' +
        '<td style="padding:10px 14px;color:#374151;border-bottom:1px solid #e5e7eb;">{{total}}</td></tr>' +
        '<tr style="background:#f8fafc;"><td style="padding:10px 14px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Balance Due</td>' +
        '<td style="padding:10px 14px;font-weight:700;color:#111827;">{{balance_due}}</td></tr>' +
        '</table>' +
        '<p style="margin:0 0 20px;"><a href="{{invoice_link}}" style="display:inline-block;padding:10px 20px;background:#0f766e;color:#ffffff;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;">View / Download Invoice</a></p>' +
        '<p style="margin:0;font-size:14px;color:#6b7280;">Thank you for your business.</p>',
      is_active: true,
    })
  }
  return template
}

export interface InvoiceEmailParams {
  businessId: string
  branchId: string | null
  relatedId: string
  relatedType: string
  customerName: string
  customerEmail: string
  invoiceNumber: string
  total: number
  amountPaid: number
  currency: string
  storeName: string
  dueAt?: string | null
  invoiceLink: string
  attachment: { filename: string; content: Buffer | Uint8Array }
}

/** Sends the invoice_created email. Returns an error message string, or null on success. */
export async function sendInvoiceCreatedEmail(p: InvoiceEmailParams): Promise<string | null> {
  const template = await ensureInvoiceCreatedTemplate(p.businessId)
  if (!template?.is_active) return 'Invoice email is disabled in Settings → Notifications for this business.'

  const fmt = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: p.currency }).format(n)
  await NotificationEngine.fire('invoice_created', {
    businessId: p.businessId,
    branchId: p.branchId,
    relatedId: p.relatedId,
    relatedType: p.relatedType,
    variables: {
      customer_name: p.customerName,
      invoice_number: p.invoiceNumber,
      total: fmt(p.total),
      balance_due: fmt(Math.max(0, p.total - p.amountPaid)),
      due_date: p.dueAt ? new Date(p.dueAt).toLocaleDateString('en-GB') : '',
      currency: p.currency,
      store_name: p.storeName,
      invoice_link: p.invoiceLink,
    },
    recipient: { email: p.customerEmail, phone: null },
    attachments: [{ filename: p.attachment.filename, content: p.attachment.content as Buffer, contentType: 'application/pdf' }],
  })
  return null
}
