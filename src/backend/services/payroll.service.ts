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

    const result = (data as {
      total_hours: number; hourly_pay: number
      commission_total: number; base_salary: number; gross_pay: number
      purchase_deductions: number; net_pay: number
    }[])[0]

    // Get employee hourly rate
    const { data: emp } = await db('employees').select('hourly_rate').eq('id', employeeId).single()
    const hourlyRate = (emp as { hourly_rate: number | null } | null)?.hourly_rate ?? 0

    return {
      total_hours:         result?.total_hours ?? 0,
      hourly_rate:         hourlyRate,
      base_salary:         result?.base_salary ?? 0,
      hourly_pay:          result?.hourly_pay ?? 0,
      commission_total:    result?.commission_total ?? 0,
      gross_pay:           result?.gross_pay ?? 0,
      purchase_deductions: result?.purchase_deductions ?? 0,
      net_pay:             result?.net_pay ?? result?.gross_pay ?? 0,
    }
  },

  async create(businessId: string, branchId: string, employeeId: string, startDate: string, endDate: string, notes?: string) {
    // Prevent double-pay: block creating a period that overlaps an existing
    // one for this employee (would double-count hours, commissions, and
    // base salary for the overlapping days).
    const { data: overlapping, error: overlapErr } = await db('payroll_periods')
      .select('id, start_date, end_date')
      .eq('employee_id', employeeId)
      .lte('start_date', endDate)
      .gte('end_date', startDate)
      .limit(1)
    if (overlapErr) throw overlapErr
    if (overlapping && overlapping.length > 0) {
      const ov = overlapping[0]
      throw new Error(`This period overlaps an existing payroll period (${ov.start_date} to ${ov.end_date}) for this employee.`)
    }

    const calc = await this.calculate(employeeId, branchId, businessId, startDate, endDate)

    const { data, error } = await db('payroll_periods')
      .insert({
        business_id:         businessId,
        branch_id:           branchId,
        employee_id:         employeeId,
        start_date:          startDate,
        end_date:            endDate,
        total_hours:         calc.total_hours,
        hourly_rate:         calc.hourly_rate,
        base_salary:         calc.base_salary,
        commission_total:    calc.commission_total,
        purchase_deductions: calc.purchase_deductions,
        notes:               notes ?? null,
        status:              'draft',
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

    // Settle outstanding employee purchases against the purchase_deductions amount
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (adminSupabase as any).rpc('settle_payroll_purchases', { p_payroll_period_id: id })

    return data as Tables<'payroll_periods'>
  },

  async reopen(id: string, branchId: string | undefined): Promise<Tables<'payroll_periods'>> {
    // Reverse purchase settlements before reopening
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (adminSupabase as any).rpc('unsettle_payroll_purchases', { p_payroll_period_id: id })

    let q = db('payroll_periods')
      .update({ status: 'draft', approved_by: null, approved_at: null })
      .eq('id', id)
      .in('status', ['approved', 'paid'])
    if (branchId) q = q.eq('branch_id', branchId)
    const { data, error } = await q.select().single()
    if (error) throw error

    // Revert linked commissions back to pending
    const { data: period } = await db('payroll_periods').select('employee_id, start_date, end_date').eq('id', id).single()
    if (period) {
      await db('employee_commissions')
        .update({ status: 'pending' })
        .eq('employee_id', period.employee_id)
        .in('status', ['approved', 'paid'])
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

  async updateCommission(id: string, businessId: string, payload: { status?: string; amount?: number }) {
    const { data, error } = await db('employee_commissions')
      .update(payload)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
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

  /**
   * List commissions with optional filters and enriched sale details.
   * Since employee_commissions.source_id has no FK (it can point to sales OR
   * repairs), sale details are fetched in a second query and merged in —
   * PostgREST can't embed a polymorphic relationship directly.
   */
  async listAll(
    businessId: string,
    branchId: string | undefined,
    page = 1,
    limit = 20,
    filters?: { employeeId?: string; month?: number; year?: number }
  ) {
    const from = (page - 1) * limit
    let q = db('employee_commissions')
      .select(`
        *,
        commission_rules(name, rate_type),
        employees(first_name, last_name)
      `, { count: 'exact' })
      .eq('business_id', businessId)

    if (filters?.employeeId) q = q.eq('employee_id', filters.employeeId)

    if (filters?.year) {
      const month = filters.month ?? null
      if (month) {
        const start = new Date(Date.UTC(filters.year, month - 1, 1)).toISOString()
        const end = new Date(Date.UTC(filters.year, month, 1)).toISOString()
        q = q.gte('created_at', start).lt('created_at', end)
      } else {
        const start = new Date(Date.UTC(filters.year, 0, 1)).toISOString()
        const end = new Date(Date.UTC(filters.year + 1, 0, 1)).toISOString()
        q = q.gte('created_at', start).lt('created_at', end)
      }
    }

    const { data, error, count } = await q
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)
    if (error) throw error

    const rows = data ?? []

    // Enrich 'sale' source rows with the underlying sale's total, payment
    // method, items, and date — so the UI can show full sale context.
    const saleIds = [...new Set(
      rows.filter((r: any) => r.source_type === 'sale').map((r: any) => r.source_id)
    )]
    let salesById: Record<string, any> = {}
    if (saleIds.length > 0) {
      const { data: sales } = await db('sales')
        .select('id, total, subtotal, discount, tax, payment_method, created_at, customers(first_name, last_name), sale_items(name, quantity, unit_price, total)')
        .in('id', saleIds)
      salesById = Object.fromEntries((sales ?? []).map((s: any) => [s.id, s]))
    }

    const enriched = rows.map((r: any) => ({
      ...r,
      sale: r.source_type === 'sale' ? (salesById[r.source_id] ?? null) : null,
    }))

    return { data: enriched, total: count ?? 0 }
  },

  /**
   * Record a commission after a sale is completed.
   * Routes commission to served_by employee when provided; falls back to cashier.
   * Cross-tenant security: served_by UUID is verified against the businessId before use.
   */
  async recordForSale(
    businessId: string,
    cashierId: string,
    sourceId: string,
    saleTotal: number,
    options?: {
      servedByEmployeeId?: string | null
      productCommission?: { type: 'percentage' | 'flat'; rate: number } | null
      // Cashier-entered commission for the served_by employee on this specific
      // sale (retail-store flow). Highest priority — only applies when a valid
      // served_by employee was resolved; never applied to a cashier fallback.
      // type 'percentage' → value is a % of saleTotal; 'flat' → value is the £ amount.
      manualCommission?: { type: 'percentage' | 'flat'; value: number } | null
    }
  ) {
    let servedBy = options?.servedByEmployeeId ?? null

    // Cross-tenant security: verify the served_by employee belongs to this business
    if (servedBy) {
      const { data: emp } = await db('employees')
        .select('id, branches!inner(business_id)')
        .eq('id', servedBy)
        .eq('branches.business_id', businessId)
        .maybeSingle()
      if (!emp) servedBy = null  // not in this tenant — fall back to cashier
    }

    const employeeId = servedBy ?? cashierId
    if (!employeeId) return

    // Cashier-entered manual commission — highest priority, retail-store flow.
    // Only applies when a specific served_by employee was actually resolved.
    if (servedBy && options?.manualCommission && options.manualCommission.value > 0) {
      const amount = options.manualCommission.type === 'percentage'
        ? parseFloat(((saleTotal * options.manualCommission.value) / 100).toFixed(2))
        : options.manualCommission.value
      await db('employee_commissions').insert({
        business_id: businessId,
        employee_id: servedBy,
        source_type: 'sale',
        source_id:   sourceId,
        rule_id:     null,
        amount,
        status:      'pending',
      })
      return
    }

    // Product-level commission takes precedence over business rules
    if (options?.productCommission && options.productCommission.rate > 0) {
      const amount = options.productCommission.type === 'percentage'
        ? parseFloat(((saleTotal * options.productCommission.rate) / 100).toFixed(2))
        : options.productCommission.rate
      await db('employee_commissions').insert({
        business_id: businessId,
        employee_id: employeeId,
        source_type: 'sale',
        source_id:   sourceId,
        rule_id:     null,
        amount,
        status:      'pending',
      })
      return
    }

    // Fall back to business-wide commission rules
    const rules = await this.listRules(businessId)
    const rule = rules.find(
      (r) => (r.applies_to === 'all' || r.applies_to === 'sales') && saleTotal >= (r.min_amount ?? 0)
    )
    if (!rule) return

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
