import { adminSupabase } from '@/backend/config/supabase'
import { InventoryService } from './inventory.service'
import { ProductService } from './product.service'
import { buildPosOverrideMap } from './repair-financials.service'

const db = (table: string): any => (adminSupabase as any).from(table)
const rpc = (fn: string, args?: Record<string, unknown>): any => (adminSupabase as any).rpc(fn, args)

// The Expense figure on the POS register summary is a one-off customization for
// a single client business — not a general feature — so it's gated behind an
// explicit business ID rather than a module setting.
const EXPENSE_STAT_BUSINESS_IDS = new Set(['b822b350-8590-49c8-a421-1018dd92c468'])

// Expenses aren't tracked by the register RPCs (register_session_expected /
// close_register_session) — they're recorded separately via the Expenses page,
// same source the dashboard's "Total Expenses" card uses. Sums them here so the
// POS session stats and Z-report can show an Expense figure alongside sales.
async function sumExpensesSince(branchId: string, sinceIso: string): Promise<number> {
  const { data } = await db('expenses')
    .select('amount')
    .eq('branch_id', branchId)
    .gte('expense_date', sinceIso)
  return (data ?? []).reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0)
}

interface TopSellerRow { name: string; quantity: number; revenue: number }

// Top products/categories by sale revenue for the P&L breakdown. Excludes
// refund line items (sales.is_refund) and service-only rows (no product_id)
// so rankings reflect actual product sales, not returns or labor.
async function getTopSellers(branchId: string, from: string, to: string): Promise<{
  topProducts: TopSellerRow[]; topCategories: TopSellerRow[]
}> {
  const { data, error } = await db('sale_items')
    .select('product_id, quantity, total, products(name, category_id, categories(name)), sales!inner(branch_id, created_at, is_refund)')
    .eq('sales.branch_id', branchId)
    .eq('sales.is_refund', false)
    .gte('sales.created_at', from)
    .lte('sales.created_at', to)
  if (error) throw error

  const byProduct: Record<string, TopSellerRow> = {}
  const byCategory: Record<string, TopSellerRow> = {}
  for (const row of (data ?? []) as any[]) {
    if (!row.product_id || !row.products) continue
    const quantity = Number(row.quantity ?? 0)
    const revenue = Number(row.total ?? 0)

    const product = byProduct[row.product_id] ??= { name: row.products.name, quantity: 0, revenue: 0 }
    product.quantity += quantity
    product.revenue += revenue

    const categoryId = row.products.category_id ?? 'uncategorized'
    const category = byCategory[categoryId] ??= { name: row.products.categories?.name ?? 'Uncategorized', quantity: 0, revenue: 0 }
    category.quantity += quantity
    category.revenue += revenue
  }

  return {
    topProducts: Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    topCategories: Object.values(byCategory).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
  }
}

// Loss detail for the P&L report: revenue given back via POS refunds and
// repair refunds, which get_profit_loss() only nets out of revenue rather
// than reporting explicitly.
async function getLossBreakdown(branchId: string, from: string, to: string) {
  const [refundsRes, repairRefundsRes] = await Promise.all([
    db('sales').select('total').eq('branch_id', branchId).eq('is_refund', true).gte('created_at', from).lte('created_at', to),
    db('repairs').select('refund_amount').eq('branch_id', branchId).gt('refund_amount', 0).gte('updated_at', from).lte('updated_at', to),
  ])
  if (refundsRes.error) throw refundsRes.error
  if (repairRefundsRes.error) throw repairRefundsRes.error

  const salesRefundRows = (refundsRes.data ?? []) as any[]
  const repairRefundRows = (repairRefundsRes.data ?? []) as any[]
  const salesRefunds = salesRefundRows.reduce((s, r) => s + Math.abs(Number(r.total ?? 0)), 0)
  const repairRefunds = repairRefundRows.reduce((s, r) => s + Number(r.refund_amount ?? 0), 0)

  return {
    sales_refunds: salesRefunds,
    sales_refund_count: salesRefundRows.length,
    repair_refunds: repairRefunds,
    repair_refund_count: repairRefundRows.length,
    total_loss: salesRefunds + repairRefunds,
  }
}

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

  // Cash In/Out for the same window — Cash In adds to Sales revenue, Cash
  // Out subtracts. Returned separately (not merged into `sales` rows) so
  // the frontend can bucket them into the same daily groups.
  async getCashMovementsReport(branchId: string, from: string, to: string) {
    const { data, error } = await db('cash_movements')
      .select('type, amount, purpose, notes, created_at, profiles!cashier_id(full_name)')
      .eq('branch_id', branchId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at')
    if (error) throw error
    return data
  },

  async getRepairsReport(branchId: string, from: string, to: string) {
    const [repairsRes, posSaleItemsRes] = await Promise.all([
      db('repairs')
        .select('id, status, actual_cost, estimated_cost, deposit_paid, refund_amount, created_at, updated_at, device_type, device_brand')
        .eq('branch_id', branchId)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at'),

      // Amounts actually charged through POS for repair-linked line items —
      // takes priority over deposit_paid/actual_cost below, same rule used by
      // the Repairs dashboard/Dashboard/Sales page (see repair-financials.service.ts).
      db('sale_items')
        .select('repair_id, total, sales!inner(is_refund, branch_id, created_at)')
        .eq('sales.branch_id', branchId)
        .gte('sales.created_at', from)
        .lte('sales.created_at', to)
        .not('repair_id', 'is', null),
    ])
    if (repairsRes.error) throw repairsRes.error

    const posOverrideMap = buildPosOverrideMap((posSaleItemsRes.data ?? []) as any[])
    return (repairsRes.data ?? []).map((r: any) => ({
      ...r,
      pos_net_total: posOverrideMap.get(r.id) ?? null,
    }))
  },

  async getProfitLoss(branchId: string, from: string, to: string) {
    const { data, error } = await rpc('get_profit_loss', {
      p_branch_id: branchId,
      p_start_date: from.split('T')[0],
      p_end_date: to.split('T')[0],
    })

    // Top sellers / loss detail are additive to whichever base P&L path runs
    // below — degrade to empty rather than failing the whole report if either
    // query hits a schema mismatch.
    const [sellers, lossBreakdown] = await Promise.all([
      getTopSellers(branchId, from, to).catch(() => ({ topProducts: [] as TopSellerRow[], topCategories: [] as TopSellerRow[] })),
      getLossBreakdown(branchId, from, to).catch(() => ({
        sales_refunds: 0, sales_refund_count: 0, repair_refunds: 0, repair_refund_count: 0, total_loss: 0,
      })),
    ])
    const extras = {
      top_products: sellers.topProducts,
      top_categories: sellers.topCategories,
      loss_breakdown: lossBreakdown,
    }

    if (error) {
      // Fallback to JS aggregation if function not migrated yet
      const [salesRes, expensesRes, salariesRes, cashMovementsRes] = await Promise.all([
        db('sales').select('total, discount, tax').eq('branch_id', branchId).gte('created_at', from).lte('created_at', to),
        db('expenses').select('amount').eq('branch_id', branchId).gte('expense_date', from).lte('expense_date', to),
        db('salaries').select('amount').eq('branch_id', branchId).gte('pay_date', from).lte('pay_date', to),
        db('cash_movements').select('type, amount, purpose').eq('branch_id', branchId).gte('created_at', from).lte('created_at', to),
      ])
      const revenue = ((salesRes.data ?? []) as any[]).reduce((s: number, r: any) => s + r.total, 0)
      const expenses = ((expensesRes.data ?? []) as any[]).reduce((s: number, r: any) => s + r.amount, 0)
      const salaries = ((salariesRes.data ?? []) as any[]).reduce((s: number, r: any) => s + r.amount, 0)
      // Cash In adds to Sales revenue, Cash Out subtracts — except 'expense'
      // purpose cash-outs, already counted via the expenses table above.
      const cashNet = ((cashMovementsRes.data ?? []) as any[]).reduce(
        (s: number, r: any) => s + (r.type === 'cash_in' ? r.amount : (r.purpose === 'expense' ? 0 : -r.amount)), 0
      )
      const totalRevenue = revenue + cashNet
      return {
        revenue, repair_revenue: 0, other_income: cashNet, total_revenue: totalRevenue, cogs: 0, expenses, salaries,
        total_costs: expenses + salaries, gross_profit: totalRevenue, net_profit: totalRevenue - expenses - salaries,
        ...extras,
      }
    }
    return { ...data, ...extras }
  },

  async getRevenuByBranch(businessId: string, from: string, to: string) {
    const { data: branches } = await db('branches')
      .select('id, name')
      .eq('business_id', businessId)
      .eq('is_active', true)

    const branchList = (branches ?? []) as any[]
    if (branchList.length === 0) return []

    const { data: salesRows } = await db('sales')
      .select('branch_id, total')
      .in('branch_id', branchList.map((b: any) => b.id))
      .gte('created_at', from)
      .lte('created_at', to)

    const totalsByBranch = ((salesRows ?? []) as any[]).reduce(
      (acc: Record<string, number>, r: any) => {
        acc[r.branch_id] = (acc[r.branch_id] ?? 0) + r.total
        return acc
      }, {}
    )

    return branchList.map((b: any) => ({
      branchId:   b.id,
      branchName: b.name,
      total:      totalsByBranch[b.id] ?? 0,
    }))
  },

  async getInventoryReport(branchId: string) {
    const [lowStockItems, batchValuation] = await Promise.all([
      InventoryService.getLowStockAlerts(branchId),
      ProductService.getBatchValuationByBranch(branchId),
    ])

    const { data: totalStock } = await db('inventory')
      .select('quantity, product_id, variant_id, products(cost_price), product_variants(cost_price)')
      .eq('branch_id', branchId)

    const totalItems = ((totalStock ?? []) as any[]).reduce((s: number, r: any) => s + (r.quantity ?? 0), 0)
    const totalValue = ((totalStock ?? []) as any[]).reduce((s: number, r: any) => {
      // Batch valuation is keyed per (product_id, variant_id) — each variant's
      // own batches are looked up independently, not blended with its siblings
      // or the base product row.
      const batch = batchValuation.get(`${r.product_id}::${r.variant_id ?? 'null'}`)
      const fallbackCost = r.product_variants?.cost_price ?? r.products?.cost_price ?? 0
      return s + (batch ? batch.totalValue : (r.quantity ?? 0) * fallbackCost)
    }, 0)

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
    const [{ data, error }, batchValuation] = await Promise.all([
      db('inventory')
        .select('quantity, products(id, name, sku, cost_price, selling_price, categories(name))')
        // Fix: previously unfiltered, so a variant's inventory row leaked into
        // this report and got priced with the PARENT product's cost/selling
        // price regardless of which variant it actually was. Base rows only —
        // matches how this report has always been described (per-product, not
        // per-variant); also required for the batch-valuation lookup below,
        // which is keyed per product and would double-count across variant rows.
        .is('variant_id', null)
        .eq('branch_id', branchId)
        .order('quantity'),
      ProductService.getBatchValuationByBranch(branchId),
    ])
    if (error) throw error

    return ((data ?? []) as any[]).map((row: any) => {
      const p = row.products
      const batch = batchValuation.get(`${p?.id}::null`)
      return {
        product_id: p?.id,
        product_name: p?.name,
        sku: p?.sku,
        category: p?.categories?.name ?? 'Uncategorised',
        quantity: row.quantity,
        cost_price: p?.cost_price ?? 0,
        sale_price: p?.selling_price ?? 0,
        stock_value: batch ? batch.totalValue : (row.quantity ?? 0) * (p?.cost_price ?? 0),
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

  // Repairs still open (not in a terminal status) after `staleDays`, whose
  // parts already left inventory (deducted at booking time — deduct_repair_parts,
  // migration 098) but whose cost hasn't hit COGS yet (get_profit_loss only
  // counts repair_items cost for terminal-status repairs, migration 131). This
  // surfaces stock that's "in limbo": already gone from stock counts, but not
  // yet reflected as a cost anywhere, for as long as the ticket stays open.
  async getStaleRepairPartsReport(branchId: string, staleDays: number) {
    const TERMINAL_NAMES      = new Set(['repaired', 'collected', 'unrepairable', 'refunded', 'completed', 'done', 'fixed', 'closed', 'picked_up', 'handover'])
    const COMPLETION_KEYWORDS = ['complet', 'done', 'fixed', 'pick', 'closed', 'resolv', 'finish', 'collect', 'handover']
    const isTerminal = (s: string) => {
      const lo = (s ?? '').toLowerCase().trim()
      return TERMINAL_NAMES.has(lo) || COMPLETION_KEYWORDS.some(kw => lo.includes(kw))
    }

    const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await db('repair_items')
      .select('repair_id, quantity, unit_cost, repairs!inner(id, job_number, status, created_at, device_type, device_brand, customers(first_name, last_name))')
      .eq('repairs.branch_id', branchId)
      .lte('repairs.created_at', cutoff)
      .not('product_id', 'is', null)
    if (error) throw error

    const byRepair: Record<string, { repair: any; parts_count: number; total_cost: number }> = {}
    for (const item of data ?? []) {
      const repair = (item as any).repairs
      if (!repair || isTerminal(repair.status)) continue
      if (!byRepair[item.repair_id]) byRepair[item.repair_id] = { repair, parts_count: 0, total_cost: 0 }
      byRepair[item.repair_id].parts_count += item.quantity ?? 0
      byRepair[item.repair_id].total_cost += (item.quantity ?? 0) * (item.unit_cost ?? 0)
    }

    const now = Date.now()
    return Object.values(byRepair)
      .map(({ repair, parts_count, total_cost }) => ({
        repair_id: repair.id,
        job_number: repair.job_number,
        customer_name: repair.customers ? [repair.customers.first_name, repair.customers.last_name].filter(Boolean).join(' ') : null,
        device: [repair.device_brand, repair.device_type].filter(Boolean).join(' ') || null,
        status: repair.status,
        created_at: repair.created_at,
        days_open: Math.floor((now - new Date(repair.created_at).getTime()) / (24 * 60 * 60 * 1000)),
        parts_count,
        total_cost_at_risk: total_cost,
      }))
      .sort((a, b) => b.days_open - a.days_open)
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
    const [{ data, error }, batchValuation] = await Promise.all([
      adminSupabase
        .from('inventory')
        .select('quantity, low_stock_alert, product_id, variant_id, products(id, name, sku, cost_price, selling_price), product_variants(cost_price, selling_price)')
        .eq('branch_id', branchId),
      ProductService.getBatchValuationByBranch(branchId),
    ])
    if (error) throw error
    return ((data ?? []) as any[])
      .filter((r: any) => (r.quantity ?? 0) <= (r.low_stock_alert ?? 5))
      .map((r: any) => {
        // "Value at risk" for a low-stock line is best represented by the
        // batch that's about to run out (the next-to-sell cost), not a
        // blended total — this report is about "what will it cost to
        // restock/what's the cost of the unit sitting at the front."
        // Keyed per (product_id, variant_id) so a variant's own next-batch
        // cost is used, not its product's blended figure.
        const batch = batchValuation.get(`${r.product_id}::${r.variant_id ?? 'null'}`)
        const fallbackCost = r.product_variants?.cost_price ?? r.products?.cost_price ?? 0
        return {
          product_id: r.products?.id,
          product_name: r.products?.name,
          sku: r.products?.sku,
          quantity: r.quantity,
          low_stock_alert: r.low_stock_alert ?? 5,
          cost_price: batch ? batch.nextUnitCost : fallbackCost,
          selling_price: r.product_variants?.selling_price ?? r.products?.selling_price ?? 0,
        }
      })
      .sort((a: any, b: any) => a.quantity - b.quantity)
  },

  // â”€â”€ Register / Z-Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async openSession(
    businessId: string,
    branchId: string,
    cashierId: string,
    openingFloat: number,
    openingNote?: string,
    openingDenominations?: Record<string, number>,
  ) {
    const { data: existing } = await db('register_sessions')
      .select('id, status')
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .maybeSingle()

    // If a session is already open, return it instead of erroring —
    // the UI will detect this and show "Join Shift" instead.
    if (existing) {
      const { data: full } = await db('register_sessions')
        .select('*')
        .eq('id', existing.id)
        .single()
      return full ?? existing
    }

    const { data, error } = await db('register_sessions')
      .insert({
        business_id: businessId,
        branch_id: branchId,
        cashier_id: cashierId,
        opening_float: openingFloat,
        opening_note: openingNote ?? null,
        opening_denominations: openingDenominations ?? {},
        status: 'open',
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async joinSession(sessionId: string, profileId: string) {
    const { data: session } = await db('register_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .eq('status', 'open')
      .single()
    if (!session) throw new Error('No active session found')

    // Upsert member record
    const { error } = await (adminSupabase as any)
      .from('register_session_members')
      .upsert({ session_id: sessionId, profile_id: profileId }, { onConflict: 'session_id,profile_id' })
    if (error) throw error
    return session
  },

  async previewExpectedCash(sessionId: string) {
    const { data, error } = await rpc('register_session_expected', { p_session_id: sessionId })
    if (error) throw error

    const { data: session } = await db('register_sessions')
      .select('business_id, branch_id, opened_at')
      .eq('id', sessionId)
      .single()
    const expenses = (session && EXPENSE_STAT_BUSINESS_IDS.has(session.business_id))
      ? await sumExpensesSince(session.branch_id, session.opened_at)
      : undefined

    return { ...data, expenses }
  },

  async closeSession(sessionId: string, closingCash: number, closingNote?: string) {
    const { data: session } = await db('register_sessions')
      .select('business_id, branch_id, opened_at')
      .eq('id', sessionId)
      .single()

    const { data, error } = await (adminSupabase as any).rpc('close_register_session', {
      p_session_id: sessionId,
      p_closing_cash: closingCash,
      p_closing_note: closingNote ?? null,
    })
    if (error) throw error

    const expenses = (session && EXPENSE_STAT_BUSINESS_IDS.has(session.business_id))
      ? await sumExpensesSince(session.branch_id, session.opened_at)
      : undefined
    return { ...data, expenses }
  },

  async getCurrentSession(branchId: string | null) {
    if (!branchId) return null

    // Base query — always works even if migration 034 isn't applied yet
    const { data: session, error } = await db('register_sessions')
      .select('*, profiles!cashier_id(full_name)')
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .maybeSingle()

    if (error || !session) return null

    // Optionally enrich with members — safe to fail if table doesn't exist yet
    try {
      const { data: members } = await (adminSupabase as any)
        .from('register_session_members')
        .select('profile_id, joined_at, profiles(full_name)')
        .eq('session_id', session.id)
      return { ...session, register_session_members: members ?? [] }
    } catch {
      return { ...session, register_session_members: [] }
    }
  },

  // Records the cash movement and, when purpose is 'expense' or 'buyback', its
  // offsetting expense/product-inventory entries — all inside a single Postgres
  // transaction (record_cash_movement RPC), so a failure in the offsetting side
  // (e.g. a duplicate barcode) rolls back the cash movement too, instead of
  // leaving cash recorded as removed from the drawer with nothing to show for it.
  async addCashMovement(payload: {
    sessionId: string; branchId: string; businessId: string
    cashierId: string; type: 'cash_in' | 'cash_out'
    amount: number; paymentType?: string; notes?: string
    purpose?: 'plain' | 'expense' | 'buyback'
    expenseCategoryId?: string | null; expenseTitle?: string | null
    buybackProductId?: string | null; buybackName?: string | null
    buybackSellingPrice?: number | null; buybackBarcode?: string | null
  }) {
    const { data, error } = await (adminSupabase as any).rpc('record_cash_movement', {
      p_session_id: payload.sessionId,
      p_branch_id: payload.branchId,
      p_business_id: payload.businessId,
      p_cashier_id: payload.cashierId,
      p_type: payload.type,
      p_amount: payload.amount,
      p_payment_type: payload.paymentType ?? 'cash',
      p_notes: payload.notes ?? null,
      p_purpose: payload.purpose ?? 'plain',
      p_expense_category_id: payload.expenseCategoryId ?? null,
      p_expense_title: payload.expenseTitle ?? null,
      p_buyback_product_id: payload.buybackProductId ?? null,
      p_buyback_name: payload.buybackName ?? null,
      p_buyback_selling_price: payload.buybackSellingPrice ?? null,
      p_buyback_barcode: payload.buybackBarcode ?? null,
    })
    if (error) throw error
    return data
  },

  async listCashMovements(sessionId: string) {
    const { data, error } = await (adminSupabase as any)
      .from('cash_movements')
      .select('*, profiles!cashier_id(full_name)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
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
