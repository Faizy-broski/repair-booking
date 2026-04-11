import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { RepairService } from '@/backend/services/repair.service'
import { CommissionService } from '@/backend/services/payroll.service'
import { NotificationEngine } from '@/backend/services/notification-engine.service'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, created, notFound, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { getPagination } from '@/backend/utils/pagination'
import { REPAIR_STATUSES } from '@/backend/config/constants'
import { z } from 'zod'

const createSchema = z.object({
  branch_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  device_type: z.string().optional().nullable(),
  device_brand: z.string().optional().nullable(),
  device_model: z.string().optional().nullable(),
  serial_number: z.string().optional().nullable(),
  issue: z.string().min(1),
  estimated_cost: z.number().min(0).optional().nullable(),
  deposit_paid: z.number().min(0).default(0),
  notify_customer: z.boolean().default(true),
  is_rush: z.boolean().default(false),
  lock_type: z.string().optional().nullable(),
  passcode: z.string().optional().nullable(),
  custom_fields: z.record(z.string(), z.unknown()).default({}),
  asset_id: z.string().uuid().optional().nullable(),
  parts: z.array(z.object({
    product_id: z.string().uuid(),
    name: z.string(),
    quantity: z.number().int().min(1).default(1),
    unit_cost: z.number().min(0).default(0),
    unit_price: z.number().min(0).default(0),
  })).optional().default([]),
})

const updateSchema = createSchema.partial().omit({ branch_id: true })

const statusSchema = z.object({
  status: z.enum(REPAIR_STATUSES),
  note: z.string().optional().default(''),
  send_email: z.boolean().default(false),
})

export const RepairController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? undefined
    const { page, limit } = getPagination(searchParams)
    try {
      const { data, count } = await RepairService.list(branchId, {
        page,
        limit,
        status: searchParams.get('status') ?? undefined,
        search: searchParams.get('search') ?? undefined,
        businessId: ctx.businessId,
      })
      return ok(data, { page, limit, total: count ?? 0 })
    } catch (err) {
      return serverError('Failed to fetch repairs', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? undefined
    try {
      const repair = await RepairService.getById(id, branchId)
      if (!repair) return notFound('Repair not found')
      return ok(repair)
    } catch (err) {
      return serverError('Failed to fetch repair', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const { parts, ...repairPayload } = data
      const repair = await RepairService.create(repairPayload)

      // Save repair items (parts) if any
      if (parts && parts.length > 0 && repair) {
        const items = parts.map(p => ({
          repair_id: repair.id,
          product_id: p.product_id,
          name: p.name,
          quantity: p.quantity,
          unit_cost: p.unit_cost,
          unit_price: p.unit_price,
        }))
        await adminSupabase.from('repair_items').insert(items)
      }

      // Fire ticket_created notification if customer is attached and notify_customer is true
      if (data.notify_customer && data.customer_id && repair) {
        const repairDetail = await RepairService.getById(repair.id, data.branch_id)
        if (repairDetail?.customers) {
          const { data: business } = await adminSupabase
            .from('businesses')
            .select('name, phone, email')
            .eq('id', ctx.businessId)
            .single()

          const customerName = `${repairDetail.customers.first_name} ${repairDetail.customers.last_name ?? ''}`.trim()
          const deviceInfo = [repairDetail.device_brand, repairDetail.device_model].filter(Boolean).join(' ') || 'Device'

          NotificationEngine.fire('ticket_created', {
            businessId: ctx.businessId,
            branchId: data.branch_id,
            relatedId: repair.id,
            relatedType: 'repair',
            variables: {
              customer_name: customerName,
              ticket_number: repair.job_number,
              device_model:  deviceInfo,
              store_name:    business?.name ?? 'RepairBooking',
              store_phone:   business?.phone ?? '',
              store_email:   business?.email ?? '',
            },
            recipient: {
              email: repairDetail.customers.email ?? null,
              phone: repairDetail.customers.phone ?? null,
            },
          }).catch(console.error)
        }
      }

      return created(repair)
    } catch (err) {
      return serverError('Failed to create repair', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    const branchId = ctx.auth.branchId ?? undefined
    try {
      const repair = await RepairService.update(id, branchId, data)
      return ok(repair)
    } catch (err) {
      return serverError('Failed to update repair', err)
    }
  },

  async updateStatus(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, statusSchema)
    if (error) return error
    try {
      await RepairService.updateStatus(id, data.status, data.note, ctx.auth.userId)

      // Fire-and-forget commission recording on completion
      if (data.status === 'completed') {
        const branchId = ctx.auth.branchId ?? null
        RepairService.getById(id, branchId).then((repair) => {
          if (repair?.assigned_to) {
            const total = (repair as Record<string, unknown>).total_cost as number ?? 0
            CommissionService.recordForRepair(ctx.businessId, repair.assigned_to, id, total).catch(() => {})
          }
        }).catch(() => {})
      }

      // Non-blocking notification via NotificationEngine (email + SMS based on template)
      if (data.send_email) {
        const branchId = ctx.auth.branchId ?? null
        const repair = await RepairService.getById(id, branchId)
        if (repair?.customers) {
          const { data: business } = await adminSupabase
            .from('businesses')
            .select('name, phone, email')
            .eq('id', ctx.businessId)
            .single()

          const customerName = `${repair.customers.first_name} ${repair.customers.last_name ?? ''}`.trim()
          const deviceInfo = [repair.device_brand, repair.device_model].filter(Boolean).join(' ') || 'Device'
          const businessName = business?.name ?? 'RepairBooking'

          // Determine trigger event
          const STATUS_LABELS: Record<string, string> = {
            received: 'Received', in_progress: 'In Progress', waiting_parts: 'Waiting for Parts',
            repaired: 'Repaired & Ready', unrepairable: 'Unfortunately Unrepairable', collected: 'Collected',
          }
          const triggerEvent = data.status === 'repaired' ? 'repair_ready' : 'ticket_status_changed'

          NotificationEngine.fire(triggerEvent as any, {
            businessId: ctx.businessId,
            branchId,
            relatedId: id,
            relatedType: 'repair',
            variables: {
              customer_name:  customerName,
              ticket_number:  repair.job_number,
              device_model:   deviceInfo,
              status:         STATUS_LABELS[data.status] ?? data.status,
              note:           data.note || '',
              store_name:     businessName,
              store_phone:    business?.phone ?? '',
              store_email:    business?.email ?? '',
            },
            recipient: {
              email: repair.customers.email ?? null,
              phone: repair.customers.phone ?? null,
            },
          }).catch(console.error)

          // Mark email sent in status history
          await adminSupabase
            .from('repair_status_history')
            .update({ email_sent: true })
            .eq('repair_id', id)
            .eq('new_status', data.status)
            .order('created_at', { ascending: false })
            .limit(1)
        }
      }

      return ok({ updated: true })
    } catch (err) {
      return serverError('Failed to update repair status', err)
    }
  },

  async getStatusHistory(request: NextRequest, ctx: RequestContext, id: string) {
    try {
      const history = await RepairService.getStatusHistory(id)
      return ok(history)
    } catch (err) {
      return serverError('Failed to fetch status history', err)
    }
  },
}
