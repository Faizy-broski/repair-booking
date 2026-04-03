import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import {
  NotificationTemplateService,
  InvoiceReminderService,
  TRIGGER_EVENTS,
  MACRO_CATALOG,
} from '@/backend/services/notification-template.service'
import { NotificationEngine } from '@/backend/services/notification-engine.service'
import { SmsService, type SmsConfig } from '@/backend/services/sms.service'
import { EmailService } from '@/backend/services/email.service'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, created, serverError, badRequest, notFound } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { z } from 'zod'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string): any => (adminSupabase as any).from(table)

// ── Schemas ───────────────────────────────────────────────────────────────────

const templateUpsertSchema = z.object({
  trigger_event: z.string().min(1),
  channel:       z.enum(['email', 'sms', 'both']).default('email'),
  subject:       z.string().nullable().optional(),
  email_body:    z.string().nullable().optional(),
  sms_body:      z.string().nullable().optional(),
  is_active:     z.boolean().optional(),
})

const templateUpdateSchema = z.object({
  channel:    z.enum(['email', 'sms', 'both']).optional(),
  subject:    z.string().nullable().optional(),
  email_body: z.string().nullable().optional(),
  sms_body:   z.string().nullable().optional(),
  is_active:  z.boolean().optional(),
})

const smsConfigSchema = z.object({
  sms_gateway:    z.enum(['twilio', 'textlocal', 'smsglobal']),
  sms_api_key:    z.string().min(1),
  sms_api_secret: z.string().optional(),
  sms_sender_id:  z.string().optional(),
})

const smsTestSchema = z.object({
  test_number: z.string().min(5),
})

const testNotificationSchema = z.object({
  trigger_event: z.string().min(1),
  channel:       z.enum(['email', 'sms']),
  recipient:     z.string().min(1),
})

const invoiceReminderSchema = z.object({
  enabled:            z.boolean().optional(),
  days_before_due:    z.number().int().min(0).max(30).optional(),
  days_after_overdue: z.array(z.number().int().min(1).max(90)).optional(),
  channel:            z.enum(['email', 'sms', 'both']).optional(),
})

const previewSchema = z.object({
  trigger_event: z.string().min(1),
  variables:     z.record(z.string(), z.string()).optional(),
})

// ── Controller ────────────────────────────────────────────────────────────────

export const NotificationController = {
  // ── Templates ─────────────────────────────────────────────────────────

  async listTemplates(request: NextRequest, ctx: RequestContext) {
    try {
      const templates = await NotificationTemplateService.list(ctx.businessId)
      return ok({
        templates,
        trigger_events: TRIGGER_EVENTS,
        macro_catalog:  MACRO_CATALOG,
      })
    } catch (err) {
      return serverError('Failed to list notification templates', err)
    }
  },

  async upsertTemplate(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, templateUpsertSchema)
    if (error) return error
    try {
      const template = await NotificationTemplateService.upsert(ctx.businessId, data)
      return created(template)
    } catch (err) {
      return serverError('Failed to save notification template', err)
    }
  },

  async updateTemplate(request: NextRequest, ctx: RequestContext, routeCtx: { params: Promise<{ id: string }> }) {
    const { id } = await routeCtx.params
    const { data, error } = await validateBody(request, templateUpdateSchema)
    if (error) return error
    try {
      const template = await NotificationTemplateService.update(id, ctx.businessId, data)
      return ok(template)
    } catch (err) {
      return serverError('Failed to update notification template', err)
    }
  },

  async seedTemplates(request: NextRequest, ctx: RequestContext) {
    try {
      await (adminSupabase as any).rpc('seed_notification_templates', { p_business_id: ctx.businessId })
      const templates = await NotificationTemplateService.list(ctx.businessId)
      return ok(templates)
    } catch (err) {
      return serverError('Failed to seed notification templates', err)
    }
  },

  // ── Preview ───────────────────────────────────────────────────────────

  async previewTemplate(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, previewSchema)
    if (error) return error
    try {
      const sampleVars: Record<string, string> = {
        customer_name: 'John Smith',
        ticket_number: 'REP-00001',
        device_model: 'iPhone 15 Pro',
        status: 'In Progress',
        note: 'Replaced the screen successfully.',
        store_name: 'My Repair Shop',
        store_phone: '+44 7911 123456',
        store_email: 'info@myrepairshop.co.uk',
        invoice_number: 'INV-00042',
        total: '149.99',
        balance_due: '149.99',
        due_date: '2026-04-15',
        currency: '£',
        estimate_total: '89.99',
        appointment_date: '2026-04-01',
        appointment_time: '10:30 AM',
        ...(data.variables ?? {}),
      }

      const preview = await NotificationEngine.preview(ctx.businessId, data.trigger_event, sampleVars)
      if (!preview) return notFound('No template found for this trigger event')
      return ok(preview)
    } catch (err) {
      return serverError('Failed to preview template', err)
    }
  },

  // ── SMS Config ────────────────────────────────────────────────────────

  async getSmsConfig(request: NextRequest, ctx: RequestContext) {
    try {
      const { data } = await db('businesses')
        .select('sms_gateway, sms_api_key, sms_api_secret, sms_sender_id')
        .eq('id', ctx.businessId)
        .single()
      // Mask the API key for security
      const masked = data ? {
        sms_gateway: data.sms_gateway,
        sms_api_key: data.sms_api_key ? `${data.sms_api_key.slice(0, 6)}${'*'.repeat(Math.max(0, data.sms_api_key.length - 6))}` : null,
        sms_api_secret: data.sms_api_secret ? '••••••••' : null,
        sms_sender_id: data.sms_sender_id,
        is_configured: !!(data.sms_gateway && data.sms_api_key),
      } : null
      return ok(masked)
    } catch (err) {
      return serverError('Failed to fetch SMS config', err)
    }
  },

  async updateSmsConfig(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, smsConfigSchema)
    if (error) return error
    try {
      await db('businesses')
        .update({
          sms_gateway:    data.sms_gateway,
          sms_api_key:    data.sms_api_key,
          sms_api_secret: data.sms_api_secret ?? null,
          sms_sender_id:  data.sms_sender_id ?? null,
          updated_at:     new Date().toISOString(),
        })
        .eq('id', ctx.businessId)
      return ok({ updated: true })
    } catch (err) {
      return serverError('Failed to update SMS config', err)
    }
  },

  async testSms(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, smsTestSchema)
    if (error) return error
    try {
      const { data: business } = await db('businesses')
        .select('sms_gateway, sms_api_key, sms_api_secret, sms_sender_id')
        .eq('id', ctx.businessId)
        .single()

      if (!business?.sms_gateway || !business?.sms_api_key) {
        return badRequest('SMS gateway not configured. Please save your SMS settings first.')
      }

      const config: SmsConfig = {
        gateway: business.sms_gateway,
        apiKey: business.sms_api_key,
        apiSecret: business.sms_api_secret,
        senderId: business.sms_sender_id,
      }

      const result = await SmsService.testConnection(config, data.test_number)
      if (result.success) {
        return ok({ success: true, messageId: result.messageId })
      }
      return badRequest(result.error ?? 'SMS test failed')
    } catch (err) {
      return serverError('Failed to send test SMS', err)
    }
  },

  // ── Test Notification (send a sample email or SMS) ────────────────────

  async testNotification(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, testNotificationSchema)
    if (error) return error
    try {
      const sampleVars: Record<string, string> = {
        customer_name: 'Test Customer',
        ticket_number: 'REP-TEST',
        device_model: 'Test Device',
        status: 'In Progress',
        note: 'This is a test notification.',
        store_name: 'My Repair Shop',
        store_phone: '+44 7911 123456',
        store_email: 'info@shop.co.uk',
        invoice_number: 'INV-TEST',
        total: '99.99',
        balance_due: '99.99',
        due_date: '2026-04-15',
        currency: '£',
        estimate_total: '59.99',
        appointment_date: '2026-04-01',
        appointment_time: '10:00 AM',
      }

      const template = await NotificationTemplateService.getByTrigger(ctx.businessId, data.trigger_event)
      if (!template) return notFound('No active template found for this trigger event')

      if (data.channel === 'email') {
        const subject = template.subject ? NotificationEngine.resolveMacros(template.subject, sampleVars) : 'Test Notification'
        const body = template.email_body ? NotificationEngine.resolveMacros(template.email_body, sampleVars) : '<p>Test</p>'
        await EmailService.sendTemplated({ to: data.recipient, subject, html: body })
        return ok({ sent: true, channel: 'email' })
      }

      if (data.channel === 'sms') {
        const { data: business } = await db('businesses')
          .select('sms_gateway, sms_api_key, sms_api_secret, sms_sender_id')
          .eq('id', ctx.businessId)
          .single()

        if (!business?.sms_gateway || !business?.sms_api_key) {
          return badRequest('SMS gateway not configured')
        }

        const body = template.sms_body ? NotificationEngine.resolveMacros(template.sms_body, sampleVars) : 'Test'
        const result = await SmsService.send(
          { gateway: business.sms_gateway, apiKey: business.sms_api_key, apiSecret: business.sms_api_secret, senderId: business.sms_sender_id },
          { to: data.recipient, body }
        )
        if (result.success) return ok({ sent: true, channel: 'sms', messageId: result.messageId })
        return badRequest(result.error ?? 'SMS failed')
      }

      return badRequest('Invalid channel')
    } catch (err) {
      return serverError('Failed to send test notification', err)
    }
  },

  // ── Invoice Reminder Settings ─────────────────────────────────────────

  async getInvoiceReminders(request: NextRequest, ctx: RequestContext) {
    try {
      const settings = await InvoiceReminderService.get(ctx.businessId)
      return ok(settings ?? {
        enabled: false,
        days_before_due: 3,
        days_after_overdue: [1, 7, 14],
        channel: 'email',
      })
    } catch (err) {
      return serverError('Failed to fetch invoice reminder settings', err)
    }
  },

  async updateInvoiceReminders(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, invoiceReminderSchema)
    if (error) return error
    try {
      const settings = await InvoiceReminderService.upsert(ctx.businessId, data)
      return ok(settings)
    } catch (err) {
      return serverError('Failed to update invoice reminder settings', err)
    }
  },

  // ── Notification Log ──────────────────────────────────────────────────

  async getLog(request: NextRequest, ctx: RequestContext) {
    try {
      const url = new URL(request.url)
      const filters = {
        channel:      url.searchParams.get('channel') ?? undefined,
        triggerEvent: url.searchParams.get('trigger_event') ?? undefined,
        status:       url.searchParams.get('status') ?? undefined,
        startDate:    url.searchParams.get('start_date') ?? undefined,
        endDate:      url.searchParams.get('end_date') ?? undefined,
        page:         parseInt(url.searchParams.get('page') ?? '1'),
        limit:        parseInt(url.searchParams.get('limit') ?? '50'),
      }
      const result = await NotificationTemplateService.getLog(ctx.businessId, filters)
      return ok(result.data, { page: filters.page, limit: filters.limit, total: result.total })
    } catch (err) {
      return serverError('Failed to fetch notification log', err)
    }
  },
}
