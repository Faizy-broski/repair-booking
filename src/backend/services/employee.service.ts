import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'
import { escapeIlike } from '@/backend/utils/search'

export const EmployeeService = {
  async list(branchId: string | null, page = 1, limit = 20) {
    if (!branchId) return { data: [], count: 0 }
    const { data, error, count } = await adminSupabase
      .from('employees')
      .select('*', { count: 'exact' })
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('first_name')
      .range((page - 1) * limit, page * limit - 1)
    if (error) throw error
    return { data, count }
  },

  async search(branchId: string, q: string, limit = 10) {
    let query = adminSupabase
      .from('employees')
      .select('id, first_name, last_name, role')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('first_name')
      .limit(limit)
    if (q.trim()) {
      const term = `%${escapeIlike(q)}%`
      query = query.or(`first_name.ilike.${term},last_name.ilike.${term}`) as typeof query
    }
    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async getById(id: string, branchId: string) {
    const { data, error } = await adminSupabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .eq('branch_id', branchId)
      .single()
    if (error) return null
    return data
  },

  async checkEmailUnique(email: string, branchId: string, excludeId?: string) {
    let q = adminSupabase
      .from('employees')
      .select('id')
      .eq('branch_id', branchId)
      .eq('email', email)
      .eq('is_active', true)
    if (excludeId) q = q.neq('id', excludeId)
    const { data } = await q.maybeSingle()
    return !data
  },

  async create(payload: InsertTables<'employees'>) {
    const { data, error } = await adminSupabase.from('employees').insert(payload).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, branchId: string, payload: UpdateTables<'employees'>) {
    const { data, error } = await adminSupabase
      .from('employees')
      .update(payload)
      .eq('id', id)
      .eq('branch_id', branchId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async delete(id: string, branchId: string) {
    const { data, error } = await adminSupabase
      .from('employees')
      .update({ is_active: false })
      .eq('id', id)
      .eq('branch_id', branchId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async clockIn(branchId: string, employeeId: string) {
    // Check if already clocked in
    const { data: active } = await adminSupabase
      .from('time_clocks')
      .select('id')
      .eq('branch_id', branchId)
      .eq('employee_id', employeeId)
      .is('clock_out', null)
      .maybeSingle()

    if (active) throw new Error('Employee is already clocked in')

    const { data, error } = await adminSupabase
      .from('time_clocks')
      .insert({ branch_id: branchId, employee_id: employeeId })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async clockOut(branchId: string, employeeId: string) {
    const { data: active } = await adminSupabase
      .from('time_clocks')
      .select('id')
      .eq('branch_id', branchId)
      .eq('employee_id', employeeId)
      .is('clock_out', null)
      .maybeSingle()

    if (!active) throw new Error('Employee is not clocked in')

    const { data, error } = await adminSupabase
      .from('time_clocks')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', active.id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  async getTimeLogs(
    branchId: string,
    filters?: { date?: string; employeeId?: string; month?: number; year?: number }
  ) {
    let q = adminSupabase
      .from('time_clocks')
      .select('*, employees(first_name,last_name)')
      .eq('branch_id', branchId)
      .order('clock_in', { ascending: false })

    if (filters?.date) {
      q = q.gte('clock_in', `${filters.date}T00:00:00Z`).lte('clock_in', `${filters.date}T23:59:59Z`)
    }
    if (filters?.employeeId) {
      q = q.eq('employee_id', filters.employeeId)
    }
    if (filters?.year) {
      const month = filters.month ?? null
      if (month) {
        const start = new Date(Date.UTC(filters.year, month - 1, 1)).toISOString()
        const end = new Date(Date.UTC(filters.year, month, 1)).toISOString()
        q = q.gte('clock_in', start).lt('clock_in', end)
      } else {
        const start = new Date(Date.UTC(filters.year, 0, 1)).toISOString()
        const end = new Date(Date.UTC(filters.year + 1, 0, 1)).toISOString()
        q = q.gte('clock_in', start).lt('clock_in', end)
      }
    }

    const { data, error } = await q
    if (error) throw error
    return data
  },

  /**
   * Manually record a completed attendance entry (clock_in + clock_out set
   * directly). For marking attendance when an employee couldn't clock in
   * themselves, or for backfilling a missed/forgotten clock-out.
   */
  async createManualClockEntry(
    branchId: string,
    employeeId: string,
    clockIn: string,
    clockOut: string | null,
    breakMinutes: number,
    notes: string | null
  ) {
    const { data, error } = await adminSupabase
      .from('time_clocks')
      .insert({
        branch_id: branchId,
        employee_id: employeeId,
        clock_in: clockIn,
        clock_out: clockOut,
        break_minutes: breakMinutes,
        notes,
      })
      .select('*, employees(first_name,last_name)')
      .single()
    if (error) throw error
    return data
  },
}
