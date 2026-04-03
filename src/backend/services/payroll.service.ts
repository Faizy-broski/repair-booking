import { adminSupabase } from '@/backend/config/supabase'
import type { Tables } from '@/types/database'

// TypeScript hits the recursive-type instantiation limit with many tables in the Database
// interface, causing Supabase's inferred Insert/Row types to resolve as `never` for tables
// added after the limit is reached. This helper bypasses that inference for new Phase-6 tables
// while keeping explicit return types at every service boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (table: string): any => (adminSupabase as any).from(table)

// ── Payroll ───────────────────────────────────────────────────────────────────

export const PayrollService = {
  async list(branchId: string | undefined, employeeId?: string): Promise<Tables<'payroll_periods'>[]> {
    let q = db('payroll_periods')
      .select('*, employees(first_name, last_name)')
      .order('start_date', { ascending: false })
    if (branchId) q = q.eq('branch_id', branchId)

    if (employeeId) q = q.eq('employee_id', employeeId)

    const { data, error } = await q
    if (error) throw error
    return data ?? []
  },

  async calculate(employeeId: string, branchId: string, businessId: string, startDate: string, endDate: string) {
    // Call DB function to get calculated amounts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (adminSupabase as any).rpc('calculate_payroll', {
      p_employee_id: employeeId,
      p_branch_id:   branchId,
      p_start_date:  startDate,
      p_end_date:    endDate,
    })
    if (error) throw error

    const result = (data as { total_hours: number; hourly_pay: number; commission_total: number; gross_pay: number }[])[0]

    // Get employee hourly rate
    const { data: emp } = await db('employees').select('hourly_rate').eq('id', employeeId).single()
    const hourlyRate = (emp as { hourly_rate: number | null } | null)?.hourly_rate ?? 0

    return {
      total_hours:      result?.total_hours ?? 0,
      hourly_rate:      hourlyRate,
      hourly_pay:       result?.hourly_pay ?? 0,
      commission_total: result?.commission_total ?? 0,
      gross_pay:        result?.gross_pay ?? 0,
    }
  },

  async create(businessId: string, branchId: string, employeeId: string, startDate: string, endDate: string, notes?: string) {
    const calc = await this.calculate(employeeId, branchId, businessId, startDate, endDate)

    const { data, error } = await db('payroll_periods')
      .insert({
        business_id:      businessId,
        branch_id:        branchId,
        employee_id:      employeeId,
        start_date:       startDate,
        end_date:         endDate,
        total_hours:      calc.total_hours,
        hourly_rate:      calc.hourly_rate,
        commission_total: calc.commission_total,
        notes:            notes ?? null,
        status:           'draft',
      })
      .select('*, employees(first_name, last_name)')
      .single()

    if (error) throw error
    return data as Tables<'payroll_periods'>
  },

  async approve(id: string, branchId: string | undefined, approvedBy: string): Promise<Tables<'payroll_periods'>> {
    let q = db('payroll_periods')
      .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString() })
      .eq('id', id)
    if (branchId) q = q.eq('branch_id', branchId)
    const { data, error } = await q.select().single()
    if (error) throw error

    // Mark linked commissions as approved
    const { data: period } = await db('payroll_periods').select('employee_id, start_date, end_date').eq('id', id).single()
    if (period) {
      await db('employee_commissions')
        .update({ status: 'approved' })
        .eq('employee_id', period.employee_id)
        .eq('status', 'pending')
        .gte('created_at', period.start_date)
        .lte('created_at', period.end_date)
    }

    return data as Tables<'payroll_periods'>
  },

  async markPaid(id: string, branchId: string | undefined): Promise<Tables<'payroll_periods'>> {
    let q = db('payroll_periods')
      .update({ status: 'paid' })
      .eq('id', id)
      .eq('status', 'approved')
    if (branchId) q = q.eq('branch_id', branchId)
    const { data, error } = await q.select().single()
    if (error) throw error

    // Mark linked commissions as paid
    const { data: period } = await db('payroll_periods').select('employee_id, start_date, end_date').eq('id', id).single()
    if (period) {
      await db('employee_commissions')
        .update({ status: 'paid' })
        .eq('employee_id', period.employee_id)
        .eq('status', 'approved')
        .gte('created_at', period.start_date)
        .lte('created_at', period.end_date)
    }

    return data as Tables<'payroll_periods'>
  },
}

// ── Commission Rules & Commissions ────────────────────────────────────────────

export const CommissionService = {
  async listRules(businessId: string): Promise<Tables<'commission_rules'>[]> {
    const { data, error } = await db('commission_rules')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    return data ?? []
  },

  async createRule(payload: {
    business_id: string; name: string; applies_to: string
    rate_type: string; rate: number; min_amount?: number
  }): Promise<Tables<'commission_rules'>> {
    const { data, error } = await db('commission_rules').insert(payload).select().single()
    if (error) throw error
    return data as Tables<'commission_rules'>
  },

  async updateRule(id: string, businessId: string, payload: Partial<{
    name: string; applies_to: string; rate_type: string; rate: number; min_amount: number; is_active: boolean
  }>): Promise<Tables<'commission_rules'>> {
    const { data, error } = await db('commission_rules')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data as Tables<'commission_rules'>
  },

  async removeRule(id: string, businessId: string) {
    const { error } = await db('commission_rules')
      .update({ is_active: false })
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },

  async listForEmployee(employeeId: string, businessId: string, page = 1, limit = 20) {
    const from = (page - 1) * limit
    const { data, error, count } = await db('employee_commissions')
      .select('*, commission_rules(name, rate_type)', { count: 'exact' })
      .eq('employee_id', employeeId)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)
    if (error) throw error
    return { data: data ?? [], total: count ?? 0 }
  },

  async listAll(businessId: string, branchId: string, page = 1, limit = 20) {
    const from = (page - 1) * limit
    const { data, error, count } = await db('employee_commissions')
      .select(`
        *,
        commission_rules(name, rate_type),
        employees(first_name, last_name)
      `, { count: 'exact' })
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)
    if (error) throw error
    return { data: data ?? [], total: count ?? 0 }
  },

  /**
   * Record a commission after a sale or repair is completed.
   * Finds the best matching active rule and computes the amount.
   */
  async recordForSale(businessId: string, employeeId: string, sourceId: string, saleTotal: number) {
    const rules = await this.listRules(businessId)
    const rule = rules.find(
      (r) => (r.applies_to === 'all' || r.applies_to === 'sales') && saleTotal >= (r.min_amount ?? 0)
    )
    if (!rule || !employeeId) return

    const amount = rule.rate_type === 'percent'
      ? parseFloat(((saleTotal * rule.rate) / 100).toFixed(2))
      : rule.rate

    await db('employee_commissions').insert({
      business_id: businessId,
      employee_id: employeeId,
      source_type: 'sale',
      source_id:   sourceId,
      rule_id:     (rule as Tables<'commission_rules'>).id,
      amount,
      status:      'pending',
    })
  },

  async recordForRepair(businessId: string, employeeId: string, sourceId: string, repairTotal: number) {
    const rules = await this.listRules(businessId)
    const rule = rules.find(
      (r) => (r.applies_to === 'all' || r.applies_to === 'repairs') && repairTotal >= (r.min_amount ?? 0)
    )
    if (!rule || !employeeId) return

    const amount = rule.rate_type === 'percent'
      ? parseFloat(((repairTotal * rule.rate) / 100).toFixed(2))
      : rule.rate

    await db('employee_commissions').insert({
      business_id: businessId,
      employee_id: employeeId,
      source_type: 'repair',
      source_id:   sourceId,
      rule_id:     (rule as Tables<'commission_rules'>).id,
      amount,
      status:      'pending',
    })
  },
}

// ── Shift Management ──────────────────────────────────────────────────────────

export const ShiftService = {
  async list(branchId: string | undefined) {
    let q = db('shifts')
      .select('*, employee_shifts(*, employees(first_name, last_name))')
      .order('name')
    if (branchId) q = q.eq('branch_id', branchId)
    const { data, error } = await q
    if (error) throw error
    return data ?? []
  },

  async create(payload: {
    business_id: string; branch_id: string; name: string
    start_time: string; end_time: string; days_of_week: number[]
  }) {
    const { data, error } = await db('shifts').insert(payload).select().single()
    if (error) throw error
    return data as Tables<'shifts'>
  },

  async update(id: string, branchId: string, payload: Partial<{
    name: string; start_time: string; end_time: string; days_of_week: number[]
  }>) {
    const { data, error } = await db('shifts').update(payload).eq('id', id).eq('branch_id', branchId).select().single()
    if (error) throw error
    return data as Tables<'shifts'>
  },

  async remove(id: string, branchId: string) {
    const { error } = await db('shifts').delete().eq('id', id).eq('branch_id', branchId)
    if (error) throw error
  },

  async assignEmployee(shiftId: string, employeeId: string, effectiveFrom: string) {
    const { data, error } = await db('employee_shifts')
      .upsert({ shift_id: shiftId, employee_id: employeeId, effective_from: effectiveFrom },
               { onConflict: 'shift_id,employee_id,effective_from' })
      .select()
      .single()
    if (error) throw error
    return data as Tables<'employee_shifts'>
  },

  async removeAssignment(id: string) {
    const { error } = await db('employee_shifts').delete().eq('id', id)
    if (error) throw error
  },
}

// ── Permission Rules ──────────────────────────────────────────────────────────

export const PermissionService = {
  async list(businessId: string) {
    const { data, error } = await db('role_permissions')
      .select('*')
      .eq('business_id', businessId)
      .order('role')
    if (error) throw error
    return data ?? []
  },

  async upsert(businessId: string, role: string, module: string, action: string, allowed: boolean, requiresPin = false) {
    const { data, error } = await db('role_permissions')
      .upsert(
        { business_id: businessId, role, module, action, allowed, requires_pin: requiresPin },
        { onConflict: 'business_id,role,module,action' }
      )
      .select()
      .single()
    if (error) throw error
    return data as Tables<'role_permissions'>
  },

  async bulkUpsert(businessId: string, rows: { role: string; module: string; action: string; allowed: boolean; requires_pin?: boolean }[]) {
    const records = rows.map((r) => ({ ...r, business_id: businessId, requires_pin: r.requires_pin ?? false }))
    const { error } = await db('role_permissions')
      .upsert(records, { onConflict: 'business_id,role,module,action' })
    if (error) throw error
  },
}
