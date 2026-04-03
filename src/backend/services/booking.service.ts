import { adminSupabase } from '@/backend/config/supabase'

// Bypass Supabase type recursion limit for Phase 9 tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string): any => (adminSupabase as any).from(table)

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BusinessHour {
  id: string
  branch_id: string
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

export interface BookingSettings {
  id: string
  branch_id: string
  is_enabled: boolean
  slot_duration_minutes: number
  buffer_minutes: number
  max_per_slot: number
  max_advance_days: number
  min_advance_hours: number
  require_approval: boolean
  cancellation_hours: number
  widget_accent_color: string
  widget_welcome_text: string
}

export interface BlockedDate {
  id: string
  branch_id: string
  blocked_date: string
  reason: string | null
}

export interface TimeSlot {
  start: string // HH:mm
  end: string   // HH:mm
  available: boolean
  remaining: number
}

// ── Business Hours Service ────────────────────────────────────────────────────

export const BusinessHoursService = {
  async list(branchId: string): Promise<BusinessHour[]> {
    const { data, error } = await db('business_hours')
      .select('*')
      .eq('branch_id', branchId)
      .order('day_of_week')
    if (error) throw error
    return data ?? []
  },

  async upsert(branchId: string, hours: Array<{ day_of_week: number; open_time: string; close_time: string; is_closed: boolean }>) {
    const rows = hours.map((h) => ({
      branch_id: branchId,
      day_of_week: h.day_of_week,
      open_time: h.open_time,
      close_time: h.close_time,
      is_closed: h.is_closed,
    }))

    const { data, error } = await db('business_hours')
      .upsert(rows, { onConflict: 'branch_id,day_of_week' })
      .select()
    if (error) throw error
    return data
  },
}

// ── Booking Settings Service ──────────────────────────────────────────────────

export const BookingSettingsService = {
  async get(branchId: string): Promise<BookingSettings | null> {
    const { data, error } = await db('booking_settings')
      .select('*')
      .eq('branch_id', branchId)
      .single()
    if (error && error.code !== 'PGRST116') throw error
    return data
  },

  async upsert(branchId: string, settings: Partial<BookingSettings>) {
    const payload = { ...settings, branch_id: branchId, updated_at: new Date().toISOString() }
    const { data, error } = await db('booking_settings')
      .upsert(payload, { onConflict: 'branch_id' })
      .select()
      .single()
    if (error) throw error
    return data
  },
}

// ── Blocked Dates Service ─────────────────────────────────────────────────────

export const BlockedDatesService = {
  async list(branchId: string): Promise<BlockedDate[]> {
    const { data, error } = await db('blocked_dates')
      .select('*')
      .eq('branch_id', branchId)
      .order('blocked_date')
    if (error) throw error
    return data ?? []
  },

  async add(branchId: string, blockedDate: string, reason?: string) {
    const { data, error } = await db('blocked_dates')
      .insert({ branch_id: branchId, blocked_date: blockedDate, reason: reason ?? null })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id: string, branchId: string) {
    await db('blocked_dates').delete().eq('id', id).eq('branch_id', branchId)
  },
}

// ── Availability / Slot Generation Service ────────────────────────────────────

export const AvailabilityService = {
  /**
   * Generate available time slots for a given date and branch.
   * Considers business hours, blocked dates, existing appointments, and booking settings.
   */
  async getSlots(branchId: string, date: string): Promise<TimeSlot[]> {
    // 1. Load booking settings
    const settings = await BookingSettingsService.get(branchId)
    if (!settings?.is_enabled) return []

    // 2. Check blocked date
    const { data: blocked } = await db('blocked_dates')
      .select('id')
      .eq('branch_id', branchId)
      .eq('blocked_date', date)
      .limit(1)
    if (blocked && blocked.length > 0) return []

    // 3. Get business hours for the day of week
    const dateObj = new Date(date + 'T00:00:00')
    const dayOfWeek = dateObj.getUTCDay() // 0=Sunday
    const hours = await db('business_hours')
      .select('*')
      .eq('branch_id', branchId)
      .eq('day_of_week', dayOfWeek)
      .single()

    if (!hours?.data || hours.data.is_closed) return []
    const bh: BusinessHour = hours.data

    // 4. Get existing appointments for this date
    const dayStart = `${date}T00:00:00`
    const dayEnd = `${date}T23:59:59`
    const { data: existingAppts } = await db('appointments')
      .select('start_time, end_time')
      .eq('branch_id', branchId)
      .gte('start_time', dayStart)
      .lte('start_time', dayEnd)
      .neq('status', 'cancelled')

    // 5. Generate time slots
    const slotDuration = settings.slot_duration_minutes
    const buffer = settings.buffer_minutes
    const maxPerSlot = settings.max_per_slot

    const [openH, openM] = bh.open_time.split(':').map(Number)
    const [closeH, closeM] = bh.close_time.split(':').map(Number)
    const openMinutes = openH * 60 + openM
    const closeMinutes = closeH * 60 + closeM

    const slots: TimeSlot[] = []
    let cursor = openMinutes

    // Enforce min_advance_hours for today
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    if (date === todayStr) {
      const minAdvanceMinutes = now.getHours() * 60 + now.getMinutes() + settings.min_advance_hours * 60
      cursor = Math.max(cursor, Math.ceil(minAdvanceMinutes / slotDuration) * slotDuration)
    }

    while (cursor + slotDuration <= closeMinutes) {
      const startH = Math.floor(cursor / 60)
      const startM = cursor % 60
      const endCursor = cursor + slotDuration
      const endH = Math.floor(endCursor / 60)
      const endM = endCursor % 60

      const startStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`
      const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

      // Count overlapping appointments
      const slotStart = new Date(`${date}T${startStr}:00`)
      const slotEnd = new Date(`${date}T${endStr}:00`)
      const overlapping = (existingAppts ?? []).filter((a: { start_time: string; end_time: string }) => {
        const aStart = new Date(a.start_time)
        const aEnd = new Date(a.end_time)
        return aStart < slotEnd && aEnd > slotStart
      }).length

      const remaining = maxPerSlot - overlapping
      slots.push({
        start: startStr,
        end: endStr,
        available: remaining > 0,
        remaining: Math.max(0, remaining),
      })

      cursor = endCursor + buffer
    }

    return slots
  },

  /**
   * Get available dates in a range (dates that have at least one open slot).
   */
  async getAvailableDates(branchId: string, fromDate: string, toDate: string): Promise<string[]> {
    const settings = await BookingSettingsService.get(branchId)
    if (!settings?.is_enabled) return []

    // Load hours + blocked dates
    const [hoursRes, blockedRes] = await Promise.all([
      db('business_hours').select('*').eq('branch_id', branchId),
      db('blocked_dates').select('blocked_date').eq('branch_id', branchId)
        .gte('blocked_date', fromDate).lte('blocked_date', toDate),
    ])

    const hours: BusinessHour[] = hoursRes.data ?? []
    const blockedSet = new Set((blockedRes.data ?? []).map((b: { blocked_date: string }) => b.blocked_date))

    const hoursByDay = new Map<number, BusinessHour>()
    hours.forEach((h) => hoursByDay.set(h.day_of_week, h))

    const available: string[] = []
    const current = new Date(fromDate + 'T00:00:00')
    const end = new Date(toDate + 'T00:00:00')

    while (current <= end) {
      const dateStr = current.toISOString().slice(0, 10)
      const dow = current.getUTCDay()
      const bh = hoursByDay.get(dow)

      if (bh && !bh.is_closed && !blockedSet.has(dateStr)) {
        available.push(dateStr)
      }
      current.setUTCDate(current.getUTCDate() + 1)
    }

    return available
  },
}
