import { adminSupabase } from '@/backend/config/supabase'
import { InventoryService } from './inventory.service'

const db = (table: string): any => (adminSupabase as any).from(table)
const rpc = (fn: string, args?: Record<string, unknown>): any => (adminSupabase as any).rpc(fn, args)

export const ReportService = {
  async getDashboardStats(branchId: string, startDate: string, endDate: string) {
    const { data, error } = await rpc('get_dashboard_stats', {
      p_branch_id: branchId,
      p_start_date: startDate,
      p_end_date: endDate,
    })
    if (error) throw error
    return data
  },

  async getSalesReport(branchId: string, from: string, to: string) {
    const { data, error } = await db('sales')
      .select('id, total, discount, tax, payment_method, created_at, customers(first_name,last_name)')
      .eq('branch_id', branchId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at')
    if (error) throw error
    return data
  },

  async getRepairsReport(branchId: string, from: string, to: string) {
    const { data, error } = await db('repairs')
      .select('id, status, actual_cost, estimated_cost, created_at, updated_at, device_type, device_brand')
      .eq('branch_id', branchId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at')
    if (error) throw error
    return data
  },

  async getProfitLoss(branchId: string, from: string, to: string) {
    const { data, error } = await rpc('get_profit_loss', {
      p_branch_id: branchId,
      p_start_date: from.split('T')[0],
      p_end_date: to.split('T')[0],
    })
    if (error) {
      // Fallback to JS aggregation if function not migrated yet
      const [salesRes, expensesRes, salariesRes] = await Promise.all([
        db('sales').select('total, discount, tax').eq('branch_id', branchId).gte('created_at', from).lte('created_at', to),
        db('expenses').select('amount').eq('branch_id', branchId).gte('expense_date', from).lte('expense_date', to),
        db('salaries').select('amount').eq('branch_id', branchId).gte('pay_date', from).lte('pay_date', to),
      ])
      const revenue = ((salesRes.data ?? []) as any[]).reduce((s: number, r: any) => s + r.total, 0)
      const expenses = ((expensesRes.data ?? []) as any[]).reduce((s: number, r: any) => s + r.amount, 0)
      const salaries = ((salariesRes.data ?? []) as any[]).reduce((s: number, r: any) => s + r.amount, 0)
      return { revenue, repair_revenue: 0, total_revenue: revenue, cogs: 0, expenses, salaries, total_costs: expenses + salaries, gross_profit: revenue, net_profit: revenue - expenses - salaries }
    }
    return data
  },

  async getRevenuByBranch(businessId: string, from: string, to: string) {
    const { data: branches } = await db('branches')
      .select('id, name')
      .eq('business_id', businessId)
      .eq('is_active', true)

    const results = await Promise.all(
      ((branches ?? []) as any[]).map(async (branch: any) => {
        const { data } = await db('sales')
          .select('total')
          .eq('branch_id', branch.id)
          .gte('created_at', from)
          .lte('created_at', to)
        const total = ((data ?? []) as any[]).reduce((s: number, r: any) => s + r.total, 0)
        return { branchId: branch.id, branchName: branch.name, total }
      })
    )

    return results
  },

  async getInventoryReport(branchId: string) {
    const lowStockItems = await InventoryService.getLowStockAlerts(branchId)

    const { data: totalStock } = await db('inventory')
      .select('quantity, products(cost_price)')
      .eq('branch_id', branchId)

    const totalItems = ((totalStock ?? []) as any[]).reduce((s: number, r: any) => s + (r.quantity ?? 0), 0)
    const totalValue = ((totalStock ?? []) as any[]).reduce(
      (s: number, r: any) => s + (r.quantity ?? 0) * (r.products?.cost_price ?? 0), 0
    )

    return {
      low_stock_count: lowStockItems.length,
      low_stock_items: lowStockItems,
      total_items: totalItems,
      total_value: totalValue,
    }
  },

  // â”€â”€ Phase 7 extensions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getTaxReport(branchId: string, from: string, to: string) {
    const [salesTax, repairTax] = await Promise.all([
      db('sale_items')
        .select('tax, tax_class, sales!inner(branch_id, created_at)')
        .eq('sales.branch_id', branchId)
        .gte('sales.created_at', from)
        .lte('sales.created_at', to),
      db('repair_items')
        .select('tax, tax_class, repairs!inner(branch_id, created_at)')
        .eq('repairs.branch_id', branchId)
        .gte('repairs.created_at', from)
        .lte('repairs.created_at', to),
    ])

    const taxByClass: Record<string, number> = {}
    for (const item of salesTax.data ?? []) {
      const cls = item.tax_class ?? 'Standard'
      taxByClass[cls] = (taxByClass[cls] ?? 0) + (item.tax ?? 0)
    }
    for (const item of repairTax.data ?? []) {
      const cls = item.tax_class ?? 'Standard'
      taxByClass[cls] = (taxByClass[cls] ?? 0) + (item.tax ?? 0)
    }

    const rows = Object.entries(taxByClass).map(([tax_class, total_tax]) => ({ tax_class, total_tax }))
    const grand_total = rows.reduce((s, r) => s + r.total_tax, 0)
    return { rows, grand_total }
  },

  async getPaymentMethodsReport(branchId: string, from: string, to: string) {
    const { data, error } = await db('sales')
      .select('payment_method, total')
      .eq('branch_id', branchId)
      .neq('payment_status', 'refunded')
      .gte('created_at', from)
      .lte('created_at', to)
    if (error) throw error

    const byMethod: Record<string, { total: number; count: number }> = {}
    for (const sale of data ?? []) {
      const method = sale.payment_method ?? 'unknown'
      if (!byMethod[method]) byMethod[method] = { total: 0, count: 0 }
      byMethod[method].total += sale.total
      byMethod[method].count += 1
    }

    return Object.entries(byMethod).map(([payment_method, { total, count }]) => ({
      payment_method,
      total,
      count,
    }))
  },

  async getEmployeeProductivityReport(branchId: string, from: string, to: string) {
    const [repairsData, salesData, commissionsData] = await Promise.all([
      db('repairs')
        .select('assigned_to, status, actual_cost')
        .eq('branch_id', branchId)
        .gte('updated_at', from)
        .lte('updated_at', to)
        .eq('status', 'completed'),
      db('sales')
        .select('created_by, total')
        .eq('branch_id', branchId)
        .gte('created_at', from)
        .lte('created_at', to)
        .neq('payment_status', 'refunded'),
      db('employee_commissions')
        .select('employee_id, commission_amount, reference_type')
        .eq('business_id', '')
        .gte('created_at', from)
        .lte('created_at', to),
    ])

    const byEmployee: Record<string, { repairs_completed: number; repair_revenue: number; sales_count: number; sales_revenue: number; commission_total: number }> = {}

    const ensure = (id: string) => {
      if (!byEmployee[id]) byEmployee[id] = { repairs_completed: 0, repair_revenue: 0, sales_count: 0, sales_revenue: 0, commission_total: 0 }
    }

    for (const r of repairsData.data ?? []) {
      if (!r.assigned_to) continue
      ensure(r.assigned_to)
      byEmployee[r.assigned_to].repairs_completed += 1
      byEmployee[r.assigned_to].repair_revenue += r.actual_cost ?? 0
    }
    for (const s of salesData.data ?? []) {
      if (!s.created_by) continue
      ensure(s.created_by)
      byEmployee[s.created_by].sales_count += 1
      byEmployee[s.created_by].sales_revenue += s.total
    }
    for (const c of commissionsData.data ?? []) {
      if (!c.employee_id) continue
      ensure(c.employee_id)
      byEmployee[c.employee_id].commission_total += c.commission_amount ?? 0
    }

    // Fetch employee names
    const profileIds = Object.keys(byEmployee)
    const { data: profiles } = await db('profiles')
      .select('id, first_name, last_name')
      .in('id', profileIds)

    const profileMap = Object.fromEntries(((profiles ?? []) as any[]).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`]))

    return Object.entries(byEmployee).map(([employee_id, stats]) => ({
      employee_id,
      employee_name: profileMap[employee_id] ?? employee_id,
      ...stats,
    }))
  },

  async getInventorySummaryReport(branchId: string) {
    const { data, error } = await db('inventory')
      .select('quantity, products(id, name, sku, cost_price, selling_price, categories(name))')
      .eq('branch_id', branchId)
      .order('quantity')
    if (error) throw error

    return ((data ?? []) as any[]).map((row: any) => {
      const p = row.products
      return {
        product_id: p?.id,
        product_name: p?.name,
        sku: p?.sku,
        category: p?.categories?.name ?? 'Uncategorised',
        quantity: row.quantity,
        cost_price: p?.cost_price ?? 0,
        sale_price: p?.selling_price ?? 0,
        stock_value: (row.quantity ?? 0) * (p?.cost_price ?? 0),
        retail_value: (row.quantity ?? 0) * (p?.selling_price ?? 0),
      }
    })
  },

  async getPartConsumptionReport(branchId: string, from: string, to: string) {
    const { data, error } = await db('repair_items')
      .select('product_id, quantity, unit_cost, repairs!inner(branch_id, created_at, status)')
      .eq('repairs.branch_id', branchId)
      .gte('repairs.created_at', from)
      .lte('repairs.created_at', to)
    if (error) throw error

    const byProduct: Record<string, { quantity: number; total_cost: number }> = {}
    for (const item of data ?? []) {
      if (!item.product_id) continue
      if (!byProduct[item.product_id]) byProduct[item.product_id] = { quantity: 0, total_cost: 0 }
      byProduct[item.product_id].quantity += item.quantity ?? 0
      byProduct[item.product_id].total_cost += (item.quantity ?? 0) * (item.unit_cost ?? 0)
    }

    const productIds = Object.keys(byProduct)
    const { data: products } = await db('products')
      .select('id, name, sku')
      .in('id', productIds)

    const productMap = Object.fromEntries(((products ?? []) as any[]).map((p: any) => [p.id, p]))

    return Object.entries(byProduct).map(([product_id, stats]) => ({
      product_id,
      product_name: productMap[product_id]?.name ?? product_id,
      sku: productMap[product_id]?.sku,
      ...stats,
    }))
  },

  async getInventoryAdjustmentsReport(branchId: string, from: string, to: string) {
    const { data, error } = await adminSupabase
      .from('stock_movements')
      .select('id, product_id, quantity, type, note, reference_id, created_at, products(name, sku)')
      .eq('branch_id', branchId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getLowStockReport(branchId: string) {
    // PostgREST can't compare two columns, so fetch all and filter in JS
    const { data, error } = await adminSupabase
      .from('inventory')
      .select('quantity, low_stock_alert, products(id, name, sku, cost_price, selling_price)')
      .eq('branch_id', branchId)
    if (error) throw error
    return ((data ?? []) as any[])
      .filter((r: any) => (r.quantity ?? 0) <= (r.low_stock_alert ?? 5))
      .map((r: any) => ({
        product_id: r.products?.id,
        product_name: r.products?.name,
        sku: r.products?.sku,
        quantity: r.quantity,
        low_stock_alert: r.low_stock_alert ?? 5,
        cost_price: r.products?.cost_price ?? 0,
        selling_price: r.products?.selling_price ?? 0,
      }))
      .sort((a: any, b: any) => a.quantity - b.quantity)
  },

  // â”€â”€ Register / Z-Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async openSession(businessId: string, branchId: string, cashierId: string, openingFloat: number) {
    // Allow only one open session per branch
    const { data: existing } = await db('register_sessions')
      .select('id, status')
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .maybeSingle()

    if (existing) throw new Error('A register session is already open for this branch')

    const { data, error } = await db('register_sessions')
      .insert({ business_id: businessId, branch_id: branchId, cashier_id: cashierId, opening_float: openingFloat, status: 'open' })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async closeSession(sessionId: string, closingCash: number) {
    const { data, error } = await (adminSupabase as any).rpc('close_register_session', {
      p_session_id: sessionId,
      p_closing_cash: closingCash,
    })
    if (error) throw error
    return data
  },

  async getCurrentSession(branchId: string) {
    const { data } = await db('register_sessions')
      .select('*, profiles!cashier_id(full_name)')
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .maybeSingle()
    return data ?? null
  },

  async getSession(sessionId: string) {
    const { data, error } = await db('register_sessions')
      .select('*, profiles!cashier_id(full_name)')
      .eq('id', sessionId)
      .single()
    if (error) throw error
    return data
  },

  async listSessions(branchId: string, from: string, to: string) {
    const { data, error } = await db('register_sessions')
      .select('*, profiles!cashier_id(full_name)')
      .eq('branch_id', branchId)
      .gte('opened_at', from)
      .lte('opened_at', to)
      .order('opened_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  // â”€â”€ Saved Reports (Custom Builder) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getSavedReports(businessId: string) {
    const { data, error } = await db('saved_reports')
      .select('*')
      .eq('business_id', businessId)
      .order('is_favorite', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async createSavedReport(businessId: string, createdBy: string, payload: { name: string; report_type: string; config: object }) {
    const { data, error } = await db('saved_reports')
      .insert({ business_id: businessId, created_by: createdBy, ...payload })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async updateSavedReport(id: string, businessId: string, payload: { name?: string; config?: object; is_favorite?: boolean }) {
    const { data, error } = await db('saved_reports')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async deleteSavedReport(id: string, businessId: string) {
    const { error } = await db('saved_reports')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
    if (error) throw error
  },
}
