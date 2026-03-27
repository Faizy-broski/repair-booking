import { adminSupabase } from '@/backend/config/supabase'
import type { InsertTables, UpdateTables } from '@/types/database'

export const EmployeeService = {
  async list(branchId: string) {
    const { data, error } = await adminSupabase
      .from('employees')
      .select('*')
      .eq('branch_id', branchId)
      .eq('is_active', true)
      .order('first_name')
    if (error) throw error
    return data
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

  async getTimeLogs(branchId: string, date?: string) {
    let q = adminSupabase
      .from('time_clocks')
      .select('*, employees(first_name,last_name)')
      .eq('branch_id', branchId)
      .order('clock_in', { ascending: false })

    if (date) {
      q = q.gte('clock_in', `${date}T00:00:00Z`).lte('clock_in', `${date}T23:59:59Z`)
    }

    const { data, error } = await q
    if (error) throw error
    return data
  },
}
