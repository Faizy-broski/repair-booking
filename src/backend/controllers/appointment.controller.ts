import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { AppointmentService } from '@/backend/services/appointment.service'
import {
  BusinessHoursService,
  BookingSettingsService,
  BlockedDatesService,
  AvailabilityService,
} from '@/backend/services/booking.service'
import { NotificationEngine } from '@/backend/services/notification-engine.service'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, created, notFound, serverError, badRequest, forbidden } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'
import { PlanLimitService } from '@/backend/services/plan-limit.service'
import { z } from 'zod'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string): any => (adminSupabase as any).from(table)

const createSchema = z.object({
  branch_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  employee_id: z.string().uuid().optional().nullable(),
  service_id: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  start_time: z.string(),
  end_time: z.string(),
  status: z.enum(['scheduled', 'confirmed', 'cancelled', 'completed', 'no_show']).default('scheduled'),
  booking_source: z.enum(['walk_in', 'phone', 'online', 'widget']).default('walk_in'),
  customer_name: z.string().optional().nullable(),
  customer_email: z.string().email().optional().nullable(),
  customer_phone: z.string().optional().nullable(),
  customer_note: z.string().optional().nullable(),
})

const updateSchema = createSchema.partial().omit({ branch_id: true })

const businessHoursSchema = z.array(z.object({
  day_of_week: z.number().min(0).max(6),
  open_time: z.string().regex(/^\d{2}:\d{2}$/),
  close_time: z.string().regex(/^\d{2}:\d{2}$/),
  is_closed: z.boolean(),
}))

const bookingSettingsSchema = z.object({
  is_enabled: z.boolean().optional(),
  slot_duration_minutes: z.number().min(5).max(480).optional(),
  buffer_minutes: z.number().min(0).max(120).optional(),
  max_per_slot: z.number().min(1).max(100).optional(),
  max_advance_days: z.number().min(1).max(365).optional(),
  min_advance_hours: z.number().min(0).max(168).optional(),
  require_approval: z.boolean().optional(),
  cancellation_hours: z.number().min(0).max(168).optional(),
  widget_accent_color: z.string().max(20).optional(),
  widget_welcome_text: z.string().max(500).optional(),
})

export const AppointmentController = {
  async list(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    try {
      const data = await AppointmentService.list(branchId, {
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
        status: searchParams.get('status') ?? undefined,
      })
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch appointments', err)
    }
  },

  async getById(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? null
    try {
      const appt = await AppointmentService.getById(id, branchId)
      if (!appt) return notFound('Appointment not found')
      return ok(appt)
    } catch (err) {
      return serverError('Failed to fetch appointment', err)
    }
  },

  async create(request: NextRequest, ctx: RequestContext) {
    const { data, error } = await validateBody(request, createSchema)
    if (error) return error
    try {
      const limitCheck = await PlanLimitService.checkLimit(ctx.businessId, 'max_appointments_per_month')
      if (!limitCheck.allowed) {
        return forbidden(`Appointment limit reached. Your plan allows ${limitCheck.limit} appointments per month.`)
      }
      const appt = await AppointmentService.create(data)

      // Fire notification if customer email is available
      const email = data.customer_email
      if (email && ctx.auth.businessId) {
        const { data: business } = await db('businesses')
          .select('name, phone, email')
          .eq('id', ctx.auth.businessId)
          .single()

        NotificationEngine.fire('appointment_reminder', {
          businessId: ctx.auth.businessId,
          branchId: data.branch_id,
          relatedId: appt.id,
          relatedType: 'appointment',
          variables: {
            customer_name: data.customer_name ?? '',
            appointment_date: data.start_time.slice(0, 10),
            appointment_time: data.start_time.slice(11, 16),
            store_name: business?.name ?? '',
            store_phone: business?.phone ?? '',
            store_email: business?.email ?? '',
          },
          recipient: { email, phone: data.customer_phone ?? null },
        })
      }

      return created(appt)
    } catch (err) {
      return serverError('Failed to create appointment', err)
    }
  },

  async update(request: NextRequest, ctx: RequestContext, id: string) {
    const { data, error } = await validateBody(request, updateSchema)
    if (error) return error
    const branchId = ctx.auth.branchId ?? null
    try {
      const appt = await AppointmentService.update(id, branchId, data)
      return ok(appt)
    } catch (err) {
      return serverError('Failed to update appointment', err)
    }
  },

  async delete(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? null
    try {
      await AppointmentService.delete(id, branchId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to delete appointment', err)
    }
  },

  // ── Business Hours ────────────────────────────────────────────────────────

  async getBusinessHours(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    try {
      const data = await BusinessHoursService.list(branchId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch business hours', err)
    }
  },

  async updateBusinessHours(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const { data, error } = await validateBody(request, z.object({ hours: businessHoursSchema }))
    if (error) return error
    try {
      const result = await BusinessHoursService.upsert(branchId, data.hours)
      return ok(result)
    } catch (err) {
      return serverError('Failed to update business hours', err)
    }
  },

  // ── Booking Settings ──────────────────────────────────────────────────────

  async getBookingSettings(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    try {
      const data = await BookingSettingsService.get(branchId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch booking settings', err)
    }
  },

  async updateBookingSettings(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const { data, error } = await validateBody(request, bookingSettingsSchema)
    if (error) return error
    try {
      const result = await BookingSettingsService.upsert(branchId, data)
      return ok(result)
    } catch (err) {
      return serverError('Failed to update booking settings', err)
    }
  },

  // ── Blocked Dates ─────────────────────────────────────────────────────────

  async getBlockedDates(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    try {
      const data = await BlockedDatesService.list(branchId)
      return ok(data)
    } catch (err) {
      return serverError('Failed to fetch blocked dates', err)
    }
  },

  async addBlockedDate(request: NextRequest, ctx: RequestContext) {
    const branchId = request.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const { data, error } = await validateBody(request, z.object({
      blocked_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().max(200).optional(),
    }))
    if (error) return error
    try {
      const result = await BlockedDatesService.add(branchId, data.blocked_date, data.reason)
      return created(result)
    } catch (err) {
      return serverError('Failed to add blocked date', err)
    }
  },

  async removeBlockedDate(request: NextRequest, ctx: RequestContext, id: string) {
    const branchId = ctx.auth.branchId ?? null
    try {
      await BlockedDatesService.remove(id, branchId)
      return ok({ deleted: true })
    } catch (err) {
      return serverError('Failed to remove blocked date', err)
    }
  },

  // ── Availability (staff view) ─────────────────────────────────────────────

  async getAvailability(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const date = searchParams.get('date')
    if (!date) return badRequest('date parameter is required')

    try {
      const slots = await AvailabilityService.getSlots(branchId, date)
      return ok(slots)
    } catch (err) {
      return serverError('Failed to fetch availability', err)
    }
  },
}
