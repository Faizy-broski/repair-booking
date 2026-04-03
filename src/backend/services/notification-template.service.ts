import { adminSupabase } from '@/backend/config/supabase'

// Bypass Supabase type recursion limit for Phase 8 tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string): any => (adminSupabase as any).from(table)

// ── Types ─────────────────────────────────────────────────────────────────────

export const TRIGGER_EVENTS = [
  'ticket_created',
  'ticket_status_changed',
  'repair_ready',
  'invoice_created',
  'invoice_overdue',
  'part_arrived',
  'estimate_sent',
  'estimate_approved',
  'estimate_declined',
  'appointment_reminder',
] as const

export type TriggerEvent = (typeof TRIGGER_EVENTS)[number]

export type NotificationChannel = 'email' | 'sms' | 'both'

export interface NotificationTemplate {
  id: string
  business_id: string
  trigger_event: TriggerEvent
  channel: NotificationChannel
  subject: string | null
  email_body: string | null
  sms_body: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface NotificationLogEntry {
  id: string
  business_id: string
  branch_id: string | null
  template_id: string | null
  trigger_event: string
  channel: 'email' | 'sms'
  recipient: string
  subject: string | null
  body: string
  status: 'sent' | 'failed' | 'queued'
  error_message: string | null
  related_id: string | null
  related_type: string | null
  created_at: string
}

// ── Available macros per trigger event ────────────────────────────────────────

export const MACRO_CATALOG: Record<string, string[]> = {
  ticket_created:         ['customer_name', 'ticket_number', 'device_model', 'store_name', 'store_phone', 'store_email'],
  ticket_status_changed:  ['customer_name', 'ticket_number', 'device_model', 'status', 'note', 'store_name', 'store_phone'],
  repair_ready:           ['customer_name', 'ticket_number', 'device_model', 'store_name', 'store_phone', 'store_email'],
  invoice_created:        ['customer_name', 'invoice_number', 'total', 'balance_due', 'due_date', 'currency', 'store_name'],
  invoice_overdue:        ['customer_name', 'invoice_number', 'total', 'balance_due', 'due_date', 'currency', 'store_name'],
  part_arrived:           ['customer_name', 'ticket_number', 'device_model', 'store_name', 'store_phone'],
  estimate_sent:          ['customer_name', 'ticket_number', 'device_model', 'estimate_total', 'currency', 'store_name'],
  estimate_approved:      ['customer_name', 'ticket_number', 'device_model', 'estimate_total', 'currency', 'store_name'],
  estimate_declined:      ['customer_name', 'ticket_number', 'device_model', 'estimate_total', 'currency', 'store_name'],
  appointment_reminder:   ['customer_name', 'appointment_date', 'appointment_time', 'store_name', 'store_phone', 'store_email'],
}

// ── Template Service ──────────────────────────────────────────────────────────

export const NotificationTemplateService = {
  async list(businessId: string) {
    const { data, error } = await db('notification_templates')
      .select('*')
      .eq('business_id', businessId)
      .order('trigger_event', { ascending: true })
    if (error) throw error
    return (data ?? []) as NotificationTemplate[]
  },

  async getByTrigger(businessId: string, triggerEvent: string): Promise<NotificationTemplate | null> {
    const { data, error } = await db('notification_templates')
      .select('*')
      .eq('business_id', businessId)
      .eq('trigger_event', triggerEvent)
      .eq('is_active', true)
      .single()
    if (error && error.code !== 'PGRST116') throw error
    return (data as NotificationTemplate) ?? null
  },

  async upsert(businessId: string, payload: {
    trigger_event: string
    channel: NotificationChannel
    subject?: string | null
    email_body?: string | null
    sms_body?: string | null
    is_active?: boolean
  }) {
    const { data, error } = await db('notification_templates')
      .upsert(
        {
          business_id: businessId,
          ...payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id,trigger_event' }
      )
      .select()
      .single()
    if (error) throw error
    return data as NotificationTemplate
  },

  async update(id: string, businessId: string, payload: Partial<{
    channel: NotificationChannel
    subject: string | null
    email_body: string | null
    sms_body: string | null
    is_active: boolean
  }>) {
    const { data, error } = await db('notification_templates')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data as NotificationTemplate
  },

  async seedForBusiness(businessId: string) {
    const { error } = await db('notification_templates').rpc('seed_notification_templates', {
      p_business_id: businessId,
    })
    // Fallback: if rpc doesn't work, the function can be called via raw SQL
    if (error) {
      const supabase = adminSupabase
      await (supabase as any).rpc('seed_notification_templates', { p_business_id: businessId })
    }
  },

  // ── Notification Log ──────────────────────────────────────────────────────

  async logNotification(entry: Omit<NotificationLogEntry, 'id' | 'created_at'>) {
    // Fire-and-forget — never throw
    db('notification_log').insert(entry).then(() => {/* intentionally ignored */})
  },

  async getLog(businessId: string, filters: {
    channel?: string
    triggerEvent?: string
    status?: string
    startDate?: string
    endDate?: string
    page?: number
    limit?: number
  }) {
    const { channel, triggerEvent, status, startDate, endDate, page = 1, limit = 50 } = filters
    const from = (page - 1) * limit

    let q = db('notification_log')
      .select('*', { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)

    if (channel)      q = q.eq('channel', channel)
    if (triggerEvent) q = q.eq('trigger_event', triggerEvent)
    if (status)       q = q.eq('status', status)
    if (startDate)    q = q.gte('created_at', `${startDate}T00:00:00Z`)
    if (endDate)      q = q.lte('created_at', `${endDate}T23:59:59Z`)

    const { data, error, count } = await q
    if (error) throw error
    return { data: (data ?? []) as NotificationLogEntry[], total: count ?? 0 }
  },
}

// ── Invoice Reminder Settings ─────────────────────────────────────────────────

export interface InvoiceReminderSettings {
  id: string
  business_id: string
  enabled: boolean
  days_before_due: number
  days_after_overdue: number[]
  channel: NotificationChannel
  created_at: string
  updated_at: string
}

export const InvoiceReminderService = {
  async get(businessId: string): Promise<InvoiceReminderSettings | null> {
    const { data, error } = await db('invoice_reminder_settings')
      .select('*')
      .eq('business_id', businessId)
      .single()
    if (error && error.code !== 'PGRST116') throw error
    return (data as InvoiceReminderSettings) ?? null
  },

  async upsert(businessId: string, payload: {
    enabled?: boolean
    days_before_due?: number
    days_after_overdue?: number[]
    channel?: NotificationChannel
  }) {
    const { data, error } = await db('invoice_reminder_settings')
      .upsert(
        {
          business_id: businessId,
          ...payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id' }
      )
      .select()
      .single()
    if (error) throw error
    return data as InvoiceReminderSettings
  },

  /**
   * Process all businesses with invoice reminders enabled.
   * Called by the /api/cron/invoice-reminders route (scheduled daily).
   * Returns a summary of how many reminders were queued.
   */
  async processAll(): Promise<{ processed: number; errors: string[] }> {
    const { NotificationEngine } = await import('./notification-engine.service')

    // Load all enabled reminder configs
    const { data: configs, error } = await db('invoice_reminder_settings')
      .select('*, businesses(id, name, currency, subdomain)')
      .eq('enabled', true)
    if (error) throw error

    let processed = 0
    const errors: string[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (const config of (configs ?? [])) {
      try {
        const businessId: string = config.business_id
        const daysBeforeDue: number = config.days_before_due ?? 3
        const daysAfterOverdue: number[] = config.days_after_overdue ?? [1, 7, 14]
        const currency: string = config.businesses?.currency ?? 'GBP'
        const storeName: string = config.businesses?.name ?? ''

        // --- Reminders before due date ---
        const beforeDate = new Date(today)
        beforeDate.setDate(beforeDate.getDate() + daysBeforeDue)
        const beforeDateStr = beforeDate.toISOString().split('T')[0]

        const { data: upcomingInvoices } = await db('invoices')
          .select('id, invoice_number, total, balance_due, due_date, customers(first_name, last_name, email, phone)')
          .eq('business_id', businessId)
          .in('status', ['unpaid', 'partial'])
          .eq('due_date', beforeDateStr)

        for (const inv of (upcomingInvoices ?? [])) {
          const customer = inv.customers
          if (!customer) continue
          await NotificationEngine.fire('invoice_overdue', {
            businessId,
            relatedId: inv.id,
            relatedType: 'invoice',
            recipient: { email: customer.email, phone: customer.phone },
            variables: {
              customer_name: `${customer.first_name} ${customer.last_name ?? ''}`.trim(),
              invoice_number: inv.invoice_number,
              amount_due: new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(inv.balance_due ?? inv.total),
              due_date: new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
              store_name: storeName,
            },
          })
          processed++
        }

        // --- Reminders after overdue ---
        for (const daysOver of daysAfterOverdue) {
          const overdueDate = new Date(today)
          overdueDate.setDate(overdueDate.getDate() - daysOver)
          const overdueDateStr = overdueDate.toISOString().split('T')[0]

          const { data: overdueInvoices } = await db('invoices')
            .select('id, invoice_number, total, balance_due, due_date, customers(first_name, last_name, email, phone)')
            .eq('business_id', businessId)
            .in('status', ['unpaid', 'partial'])
            .eq('due_date', overdueDateStr)

          for (const inv of (overdueInvoices ?? [])) {
            const customer = inv.customers
            if (!customer) continue
            await NotificationEngine.fire('invoice_overdue', {
              businessId,
              relatedId: inv.id,
              relatedType: 'invoice',
              recipient: { email: customer.email, phone: customer.phone },
              variables: {
                customer_name: `${customer.first_name} ${customer.last_name ?? ''}`.trim(),
                invoice_number: inv.invoice_number,
                amount_due: new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(inv.balance_due ?? inv.total),
                due_date: new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                store_name: storeName,
                days_overdue: String(daysOver),
              },
            })
            processed++
          }
        }
      } catch (err) {
        errors.push(`Business ${config.business_id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return { processed, errors }
  },
}
