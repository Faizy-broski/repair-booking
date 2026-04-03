import { adminSupabase } from '@/backend/config/supabase'

export const TimeClockService = {
  async getLogsForDay(branchId: string, date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0]
    const startOfDay = `${targetDate}T00:00:00.000Z`
    const endOfDay = `${targetDate}T23:59:59.999Z`

    const { data, error } = await adminSupabase
      .from('time_clocks')
      .select('*, employees(first_name,last_name)')
      .eq('branch_id', branchId)
      .gte('clock_in', startOfDay)
      .lte('clock_in', endOfDay)
      .order('clock_in', { ascending: false })
    if (error) throw error
    return data
  },

  async getLogsForEmployee(branchId: string, employeeId: string, from?: string, to?: string) {
    let q = adminSupabase
      .from('time_clocks')
      .select('*')
      .eq('branch_id', branchId)
      .eq('employee_id', employeeId)
      .order('clock_in', { ascending: false })

    if (from) q = q.gte('clock_in', from)
    if (to) q = q.lte('clock_in', to)

    const { data, error } = await q
    if (error) throw error
    return data
  },

  /** Returns hours worked from a set of time_clock rows. */
  calculateHours(logs: { clock_in: string; clock_out: string | null; break_minutes: number | null }[]) {
    return logs.reduce((total, log) => {
      if (!log.clock_out) return total
      const ms = new Date(log.clock_out).getTime() - new Date(log.clock_in).getTime()
      const breakMs = (log.break_minutes ?? 0) * 60 * 1000
      return total + Math.max(0, ms - breakMs) / (1000 * 60 * 60)
    }, 0)
  },
}
