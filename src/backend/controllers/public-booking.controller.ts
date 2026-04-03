/**
 * PublicBookingController — unauthenticated endpoints for the public booking widget.
 *
 * All endpoints require a branch slug to resolve the branch. No auth token needed.
 * Rate limiting is applied at the route level.
 */

import { NextRequest } from 'next/server'
import { adminSupabase } from '@/backend/config/supabase'
import { AppointmentService } from '@/backend/services/appointment.service'
import {
  AvailabilityService,
  BookingSettingsService,
} from '@/backend/services/booking.service'
import { NotificationEngine } from '@/backend/services/notification-engine.service'
import { ok, badRequest, notFound, serverError } from '@/backend/utils/api-response'
import { z } from 'zod'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string): any => (adminSupabase as any).from(table)

// ── Resolve branch by slug (or ID) ───────────────────────────────────────────

async function resolveBranch(branchSlugOrId: string) {
  // Try by ID first (UUID format)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (uuidRegex.test(branchSlugOrId)) {
    const { data } = await db('branches')
      .select('id, business_id, name, address, phone, email')
      .eq('id', branchSlugOrId)
      .eq('is_active', true)
      .single()
    return data
  }

  // Try by slug
  const { data } = await db('branches')
    .select('id, business_id, name, address, phone, email')
    .eq('slug', branchSlugOrId)
    .eq('is_active', true)
    .single()
  return data
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const bookSchema = z.object({
  branch_id: z.string().uuid(),
  service_id: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:mm'),
  customer_name: z.string().min(1, 'Name is required').max(200),
  customer_email: z.string().email('Valid email is required').max(200),
  customer_phone: z.string().max(30).optional(),
  customer_note: z.string().max(1000).optional(),
})

// ── Controller ────────────────────────────────────────────────────────────────

export const PublicBookingController = {
  /**
   * GET /api/public/booking/config?branch_id=...
   * Returns booking settings + business hours + branch info for the widget.
   */
  async getConfig(request: NextRequest) {
    const branchId = request.nextUrl.searchParams.get('branch_id')
    if (!branchId) return badRequest('branch_id is required')

    try {
      const branch = await resolveBranch(branchId)
      if (!branch) return notFound('Branch not found')

      const settings = await BookingSettingsService.get(branch.id)
      if (!settings?.is_enabled) return notFound('Online booking is not enabled for this branch')

      const { data: hours } = await db('business_hours')
        .select('day_of_week, open_time, close_time, is_closed')
        .eq('branch_id', branch.id)
        .order('day_of_week')

      // Get business info for branding
      const { data: business } = await db('businesses')
        .select('name, logo_url')
        .eq('id', branch.business_id)
        .single()

      return ok({
        branch: { id: branch.id, name: branch.name, address: branch.address, phone: branch.phone },
        business: { name: business?.name, logo_url: business?.logo_url },
        settings: {
          slot_duration_minutes: settings.slot_duration_minutes,
          max_advance_days: settings.max_advance_days,
          cancellation_hours: settings.cancellation_hours,
          widget_accent_color: settings.widget_accent_color,
          widget_welcome_text: settings.widget_welcome_text,
        },
        hours: hours ?? [],
      })
    } catch (err) {
      return serverError('Failed to load booking config', err)
    }
  },

  /**
   * GET /api/public/booking/services?branch_id=...
   * Returns services available for public booking (show_on_portal = true).
   */
  async getServices(request: NextRequest) {
    const branchId = request.nextUrl.searchParams.get('branch_id')
    if (!branchId) return badRequest('branch_id is required')

    try {
      const branch = await resolveBranch(branchId)
      if (!branch) return notFound('Branch not found')

      const { data, error } = await db('service_problems')
        .select(`
          id, name, price, warranty_days,
          service_categories(name),
          service_devices(name, service_manufacturers(name))
        `)
        .eq('business_id', branch.business_id)
        .eq('show_on_portal', true)
        .order('name')

      if (error) throw error
      return ok(data ?? [])
    } catch (err) {
      return serverError('Failed to load services', err)
    }
  },

  /**
   * GET /api/public/booking/slots?branch_id=...&date=YYYY-MM-DD
   * Returns available time slots for a specific date.
   */
  async getSlots(request: NextRequest) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id')
    const date = searchParams.get('date')

    if (!branchId) return badRequest('branch_id is required')
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest('date must be YYYY-MM-DD')

    try {
      const branch = await resolveBranch(branchId)
      if (!branch) return notFound('Branch not found')

      // Check max_advance_days
      const settings = await BookingSettingsService.get(branch.id)
      if (!settings?.is_enabled) return notFound('Online booking is not enabled')

      const requestedDate = new Date(date + 'T00:00:00')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const maxDate = new Date(today)
      maxDate.setDate(maxDate.getDate() + settings.max_advance_days)

      if (requestedDate < today) return badRequest('Cannot book in the past')
      if (requestedDate > maxDate) return badRequest(`Cannot book more than ${settings.max_advance_days} days in advance`)

      const slots = await AvailabilityService.getSlots(branch.id, date)
      return ok(slots)
    } catch (err) {
      return serverError('Failed to load slots', err)
    }
  },

  /**
   * GET /api/public/booking/dates?branch_id=...&from=YYYY-MM-DD&to=YYYY-MM-DD
   * Returns available dates in a range (for calendar highlighting).
   */
  async getAvailableDates(request: NextRequest) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!branchId) return badRequest('branch_id is required')
    if (!from || !to) return badRequest('from and to dates are required')

    try {
      const branch = await resolveBranch(branchId)
      if (!branch) return notFound('Branch not found')

      const dates = await AvailabilityService.getAvailableDates(branch.id, from, to)
      return ok(dates)
    } catch (err) {
      return serverError('Failed to load dates', err)
    }
  },

  /**
   * POST /api/public/booking/create
   * Create a new appointment from public booking widget.
   */
  async book(request: NextRequest) {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return badRequest('Invalid JSON body')
    }

    const parsed = bookSchema.safeParse(body)
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(', ')
      return badRequest(msg)
    }

    const { branch_id, service_id, date, start_time, customer_name, customer_email, customer_phone, customer_note } = parsed.data

    try {
      // 1. Validate branch exists and booking is enabled
      const branch = await resolveBranch(branch_id)
      if (!branch) return notFound('Branch not found')

      const settings = await BookingSettingsService.get(branch.id)
      if (!settings?.is_enabled) return badRequest('Online booking is not enabled for this branch')

      // 2. Build start/end times
      const startDateTime = `${date}T${start_time}:00`
      const endDate = new Date(startDateTime)
      endDate.setMinutes(endDate.getMinutes() + settings.slot_duration_minutes)
      const endDateTime = endDate.toISOString()

      // 3. Verify slot is still available
      const slots = await AvailabilityService.getSlots(branch.id, date)
      const targetSlot = slots.find((s) => s.start === start_time)
      if (!targetSlot || !targetSlot.available) {
        return badRequest('Selected time slot is no longer available')
      }

      // 4. Build title
      let title = `Online Booking - ${customer_name}`
      if (service_id) {
        const { data: svc } = await db('service_problems').select('name').eq('id', service_id).single()
        if (svc) title = `${svc.name} - ${customer_name}`
      }

      // 5. Determine initial status
      const status = settings.require_approval ? 'scheduled' : 'confirmed'

      // 6. Create appointment
      const appointment = await AppointmentService.createPublicBooking({
        branch_id: branch.id,
        service_id,
        title,
        start_time: startDateTime,
        end_time: endDateTime,
        customer_name,
        customer_email,
        customer_phone,
        customer_note,
        status,
        booking_source: 'widget',
      })

      // 7. Fire notification (fire-and-forget)
      const { data: business } = await db('businesses')
        .select('name, phone, email')
        .eq('id', branch.business_id)
        .single()

      NotificationEngine.fire('appointment_reminder', {
        businessId: branch.business_id,
        branchId: branch.id,
        relatedId: appointment.id,
        relatedType: 'appointment',
        variables: {
          customer_name,
          appointment_date: date,
          appointment_time: start_time,
          store_name: business?.name ?? '',
          store_phone: business?.phone ?? '',
          store_email: business?.email ?? '',
        },
        recipient: { email: customer_email, phone: customer_phone ?? null },
      })

      return ok({
        id: appointment.id,
        status: appointment.status,
        booking_token: appointment.booking_token,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        message: settings.require_approval
          ? 'Your appointment request has been submitted and is pending approval.'
          : 'Your appointment has been confirmed!',
      })
    } catch (err) {
      return serverError('Failed to create booking', err)
    }
  },

  /**
   * GET /api/public/booking/status?token=...
   * Check appointment status by booking token.
   */
  async getStatus(request: NextRequest) {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) return badRequest('token is required')

    try {
      const appt = await AppointmentService.getByToken(token)
      if (!appt) return notFound('Booking not found')

      return ok({
        id: appt.id,
        title: appt.title,
        start_time: appt.start_time,
        end_time: appt.end_time,
        status: appt.status,
        service: appt.service_problems?.name ?? null,
        customer_name: appt.customer_name,
      })
    } catch (err) {
      return serverError('Failed to fetch booking status', err)
    }
  },

  /**
   * POST /api/public/booking/cancel
   * Cancel an appointment by booking token.
   */
  async cancel(request: NextRequest) {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return badRequest('Invalid JSON body')
    }

    const schema = z.object({ token: z.string().min(1) })
    const parsed = schema.safeParse(body)
    if (!parsed.success) return badRequest('token is required')

    try {
      const existing = await AppointmentService.getByToken(parsed.data.token)
      if (!existing) return notFound('Booking not found')

      // Check cancellation window
      const branchId = existing.branch_id
      const settings = await BookingSettingsService.get(branchId)
      if (settings) {
        const apptTime = new Date(existing.start_time).getTime()
        const now = Date.now()
        const hoursUntil = (apptTime - now) / (1000 * 60 * 60)
        if (hoursUntil < settings.cancellation_hours) {
          return badRequest(`Cancellation must be at least ${settings.cancellation_hours} hours before the appointment`)
        }
      }

      const cancelled = await AppointmentService.cancelByToken(parsed.data.token)
      if (!cancelled) return badRequest('Appointment could not be cancelled')

      return ok({ status: 'cancelled', message: 'Your appointment has been cancelled.' })
    } catch (err) {
      return serverError('Failed to cancel booking', err)
    }
  },
}
