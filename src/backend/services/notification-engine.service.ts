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
import { EmailService } from './email.service'
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

async function getBusinessName(businessId: string): Promise<string> {
  const { data } = await db('businesses')
    .select('name')
    .eq('id', businessId)
    .single()
  return data?.name ?? 'RepairBooking'
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
      const emailBody = template.email_body ? resolveMacros(template.email_body, variables) : null
      const smsBody   = template.sms_body  ? resolveMacros(template.sms_body, variables)   : null

      const sendEmail = (template.channel === 'email' || template.channel === 'both') && recipient.email && emailBody
      const sendSms   = (template.channel === 'sms'   || template.channel === 'both') && recipient.phone && smsBody

      // Dispatch email
      if (sendEmail) {
        const businessName = variables.store_name ?? await getBusinessName(businessId)
        EmailService.sendTemplated({
          to: recipient.email!,
          subject: subject ?? `Notification from ${businessName}`,
          html: emailBody!,
          fromName: businessName,
          businessId,
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
