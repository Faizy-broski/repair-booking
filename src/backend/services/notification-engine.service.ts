/**
 * NotificationEngine — central orchestrator for all automated notifications.
 *
 * Usage:
 *   await NotificationEngine.fire('ticket_status_changed', {
 *     businessId: '...',
 *     branchId:   '...',
 *     relatedId:  repairId,
 *     relatedType: 'repair',
 *     variables: { customer_name: 'John', ticket_number: 'REP-001', ... },
 *     recipient:  { email: 'john@example.com', phone: '+447911123456' },
 *   })
 *
 * Flow:
 * 1. Lookup the active template for this business + trigger_event
 * 2. Resolve macros in subject, email_body, sms_body
 * 3. Dispatch via email and/or SMS based on template channel
 * 4. Log every dispatch attempt in notification_log
 */

import { adminSupabase } from '@/backend/config/supabase'
import { NotificationTemplateService, type TriggerEvent } from './notification-template.service'
import { EmailService, type EmailAttachment } from './email.service'
import { SmsService, type SmsConfig } from './sms.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string): any => (adminSupabase as any).from(table)

export interface NotificationPayload {
  businessId: string
  branchId?: string | null
  relatedId?: string | null
  relatedType?: string | null     // 'repair', 'invoice', 'estimate', 'appointment'
  variables: Record<string, string>
  recipient: {
    email?: string | null
    phone?: string | null
  }
  /** Email-only. e.g. an invoice PDF — ignored for SMS dispatch. */
  attachments?: EmailAttachment[]
}

// ── Macro Resolver ────────────────────────────────────────────────────────────

/**
 * Replace {{macro}} placeholders in a template string with values from the variables map.
 * Also handles simple conditional blocks: {{#note}}...{{/note}} (rendered only if variable is truthy).
 */
function resolveMacros(template: string, variables: Record<string, string>): string {
  let result = template

  // Conditional blocks: {{#key}}content{{/key}}
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    return variables[key] ? content : ''
  })

  // Simple macros: {{key}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return variables[key] ?? ''
  })

  return result
}

// ── Fallback email builder for repair events ──────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  received:       '#3b82f6',
  in_progress:    '#f59e0b',
  waiting_parts:  '#8b5cf6',
  repaired:       '#10b981',
  unrepairable:   '#ef4444',
  collected:      '#6b7280',
}

const STATUS_LABEL: Record<string, string> = {
  received:       'Received',
  in_progress:    'In Progress',
  waiting_parts:  'Waiting for Parts',
  repaired:       'Repaired & Ready',
  unrepairable:   'Unfortunately Unrepairable',
  collected:      'Collected',
}

function buildFallbackRepairEmail(v: Record<string, string>): string {
  const statusKey  = (v.status ?? '').toLowerCase().replace(/\s+/g, '_')
  const statusLabel = STATUS_LABEL[statusKey] ?? v.status ?? 'Updated'
  const statusColor = STATUS_COLOR[statusKey] ?? '#008080'

  return `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1f2937;line-height:1.6">
  <p style="margin:0 0 16px">Hi <strong>${v.customer_name || 'Customer'}</strong>,</p>
  <p style="margin:0 0 20px">We have an update on your repair job. Here are the details:</p>

  <!-- Repair summary card -->
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px">
    <tr style="background:#f9fafb">
      <td colspan="2" style="padding:12px 16px;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:1px solid #e5e7eb">
        Repair Details
      </td>
    </tr>
    ${v.ticket_number ? `
    <tr>
      <td style="padding:10px 16px;color:#6b7280;font-size:13px;width:40%;border-bottom:1px solid #f3f4f6">Job Number</td>
      <td style="padding:10px 16px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6">${v.ticket_number}</td>
    </tr>` : ''}
    ${v.device_brand ? `
    <tr style="background:#f8fafc">
      <td style="padding:10px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6">Brand</td>
      <td style="padding:10px 16px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6">${v.device_brand}</td>
    </tr>` : ''}
    ${v.device_model ? `
    <tr>
      <td style="padding:10px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6">Model</td>
      <td style="padding:10px 16px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6">${v.device_model}</td>
    </tr>` : ''}
    ${v.issue ? `
    <tr style="background:#f8fafc">
      <td style="padding:10px 16px;color:#6b7280;font-size:13px;border-bottom:1px solid #f3f4f6">Issue</td>
      <td style="padding:10px 16px;color:#111827;border-bottom:1px solid #f3f4f6">${v.issue}</td>
    </tr>` : ''}
    <tr>
      <td style="padding:10px 16px;color:#6b7280;font-size:13px">Status</td>
      <td style="padding:10px 16px;font-weight:700;color:${statusColor}">${statusLabel}</td>
    </tr>
  </table>

  ${v.note ? `
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:24px">
    <p style="margin:0;font-size:13px;color:#92400e"><strong>Note from our team:</strong> ${v.note}</p>
  </div>` : ''}

  <p style="margin:0 0 8px;color:#6b7280;font-size:13px">
    If you have any questions, please don't hesitate to contact us:
  </p>
  ${v.store_phone ? `<p style="margin:0;font-size:13px"><strong>Phone:</strong> ${v.store_phone}</p>` : ''}
  ${v.store_email ? `<p style="margin:0;font-size:13px"><strong>Email:</strong> ${v.store_email}</p>` : ''}
</div>
  `.trim()
}

// ── Fetch business SMS config ─────────────────────────────────────────────────

async function getSmsConfig(businessId: string): Promise<SmsConfig | null> {
  const { data } = await db('businesses')
    .select('sms_gateway, sms_api_key, sms_api_secret, sms_sender_id')
    .eq('id', businessId)
    .single()

  if (!data?.sms_gateway || !data?.sms_api_key) return null

  return {
    gateway: data.sms_gateway,
    apiKey: data.sms_api_key,
    apiSecret: data.sms_api_secret ?? null,
    senderId: data.sms_sender_id ?? null,
  }
}

async function getBusinessInfo(businessId: string): Promise<{
  name: string; phone: string; email: string; replyToEmail: string | null; logoUrl: string | null; primaryColor: string
}> {
  const [{ data: biz }, { data: invSettings }] = await Promise.all([
    db('businesses').select('name, phone, email, reply_to_email, logo_url').eq('id', businessId).single(),
    db('invoice_settings').select('primary_color, logo_url').eq('business_id', businessId).single(),
  ])
  return {
    name:         biz?.name            ?? 'RepairBooking',
    phone:        biz?.phone           ?? '',
    email:        biz?.email           ?? '',
    replyToEmail: biz?.reply_to_email  ?? null,
    logoUrl:      invSettings?.logo_url ?? biz?.logo_url ?? null,
    primaryColor: invSettings?.primary_color ?? '#008080',
  }
}

// ── Notification Log Helper ───────────────────────────────────────────────────

function logEntry(
  businessId: string,
  branchId: string | null,
  templateId: string | null,
  triggerEvent: string,
  channel: 'email' | 'sms',
  recipient: string,
  subject: string | null,
  body: string,
  status: 'sent' | 'failed',
  errorMessage: string | null,
  relatedId: string | null,
  relatedType: string | null
) {
  // Fire-and-forget — never block the caller
  db('notification_log').insert({
    business_id:   businessId,
    branch_id:     branchId ?? null,
    template_id:   templateId ?? null,
    trigger_event: triggerEvent,
    channel,
    recipient,
    subject:       subject ?? null,
    body,
    status,
    error_message: errorMessage ?? null,
    related_id:    relatedId ?? null,
    related_type:  relatedType ?? null,
  }).then(() => {/* intentionally ignored */})
}

// ── Public API ────────────────────────────────────────────────────────────────

export const NotificationEngine = {
  /**
   * Fire a notification for a given trigger event.
   * Looks up the business template, resolves macros, dispatches via configured channels.
   * All operations are non-blocking (fire-and-forget) to avoid slowing down the caller.
   */
  async fire(triggerEvent: TriggerEvent, payload: NotificationPayload): Promise<void> {
    try {
      const template = await NotificationTemplateService.getByTrigger(payload.businessId, triggerEvent)
      if (!template) return // No template configured or template is inactive

      const { variables, recipient, businessId, branchId, relatedId, relatedType } = payload

      // Resolve macros
      const subject   = template.subject   ? resolveMacros(template.subject, variables)    : null
      const rawEmailBody = template.email_body ? resolveMacros(template.email_body, variables) : null
      const smsBody   = template.sms_body  ? resolveMacros(template.sms_body, variables)   : null

      const isRepairEvent = triggerEvent === 'ticket_status_changed' || triggerEvent === 'repair_ready'
      const emailBody = rawEmailBody || (isRepairEvent ? buildFallbackRepairEmail(variables) : null)

      const sendEmail = (template.channel === 'email' || template.channel === 'both') && recipient.email && emailBody
      const sendSms   = (template.channel === 'sms'   || template.channel === 'both') && recipient.phone && smsBody

      // Dispatch email
      if (sendEmail) {
        const bizInfo = await getBusinessInfo(businessId)
        const businessName = variables.store_name || bizInfo.name
        EmailService.sendTemplated({
          to:          recipient.email!,
          subject:     subject ?? `Notification from ${businessName}`,
          html:        emailBody!,
          fromName:    businessName,
          businessId,
          logoUrl:      bizInfo.logoUrl,
          storePhone:   variables.store_phone || bizInfo.phone,
          storeEmail:   variables.store_email || bizInfo.email,
          replyTo:      bizInfo.replyToEmail ?? undefined,
          primaryColor: bizInfo.primaryColor,
          attachments:  payload.attachments,
        })
          .then(() => {
            logEntry(businessId, branchId ?? null, template.id, triggerEvent, 'email',
              recipient.email!, subject, emailBody!, 'sent', null, relatedId ?? null, relatedType ?? null)
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err)
            logEntry(businessId, branchId ?? null, template.id, triggerEvent, 'email',
              recipient.email!, subject, emailBody!, 'failed', msg, relatedId ?? null, relatedType ?? null)
            console.error(`[NotificationEngine] Email failed for ${triggerEvent}:`, msg)
          })
      }

      // Dispatch SMS
      if (sendSms) {
        const smsConfig = await getSmsConfig(businessId)
        if (smsConfig) {
          SmsService.send(smsConfig, { to: recipient.phone!, body: smsBody! })
            .then((result) => {
              logEntry(businessId, branchId ?? null, template.id, triggerEvent, 'sms',
                recipient.phone!, null, smsBody!, result.success ? 'sent' : 'failed',
                result.error ?? null, relatedId ?? null, relatedType ?? null)
              if (!result.success) {
                console.error(`[NotificationEngine] SMS failed for ${triggerEvent}:`, result.error)
              }
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err)
              logEntry(businessId, branchId ?? null, template.id, triggerEvent, 'sms',
                recipient.phone!, null, smsBody!, 'failed', msg, relatedId ?? null, relatedType ?? null)
              console.error(`[NotificationEngine] SMS dispatch error for ${triggerEvent}:`, msg)
            })
        }
      }
    } catch (err) {
      // Engine should never throw — log and swallow
      console.error('[NotificationEngine] fire() error:', err)
    }
  },

  /**
   * Resolve macros in a template string (used for preview in the UI).
   */
  resolveMacros,

  /**
   * Preview a rendered template without sending.
   */
  async preview(businessId: string, triggerEvent: string, sampleVariables: Record<string, string>) {
    const template = await NotificationTemplateService.getByTrigger(businessId, triggerEvent)
    if (!template) return null

    return {
      subject:   template.subject   ? resolveMacros(template.subject, sampleVariables)    : null,
      emailBody: template.email_body ? resolveMacros(template.email_body, sampleVariables) : null,
      smsBody:   template.sms_body  ? resolveMacros(template.sms_body, sampleVariables)   : null,
    }
  },
}
