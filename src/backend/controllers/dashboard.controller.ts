import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

const TERMINAL_NAMES      = new Set(['repaired', 'collected', 'unrepairable'])
const COMPLETION_KEYWORDS = ['complet', 'done', 'fixed', 'pick', 'closed', 'resolv', 'finish', 'collect', 'handover']
const isTerminal = (s: string) => TERMINAL_NAMES.has(s) || COMPLETION_KEYWORDS.some(kw => s.includes(kw))

function getPeriodStart(period: string): string {
  const now = new Date()
  if (period === 'year')    return new Date(now.getFullYear(), 0, 1).toISOString()
  if (period === '6months') return new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString()
  if (period === '3months') return new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

export const DashboardController = {

  // ── Fast path: stats + recent repairs + activity ──────────────────────────
  // Does NOT run the sequential branch-revenue queries.
  async getMain(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId   = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const period     = searchParams.get('period') ?? 'month'
    const periodStart = getPeriodStart(period)

    try {
      const urgentCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      const TERMINAL_IN  = '(repaired,collected,unrepairable,refunded)'

      const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).toISOString()

      const [
        salesRes,
        expensesRes,
        repairsTotalRes,
        repairsOpenRes,
        repairsUrgentRes,
        inventoryRes,
        recentRepairsRes,
        activityRes,
        repairsRevenueRes,
        salesCogsRes,
        repairsPartsRes,
        todaySalesRes,
        posRepairAmountsRes,
        cashMovementsRes,
      ] = await Promise.all([
        adminSupabase.from('sales').select('id, total, created_at').eq('branch_id', branchId).gte('created_at', periodStart),
        adminSupabase.from('expenses').select('amount').eq('branch_id', branchId).gte('expense_date', periodStart),
        (adminSupabase as any).from('repairs').select('*', { count: 'exact', head: true }).eq('branch_id', branchId) as Promise<{ count: number | null; error: unknown }>,
        (adminSupabase as any).from('repairs').select('*', { count: 'exact', head: true }).eq('branch_id', branchId).not('status', 'in', TERMINAL_IN) as Promise<{ count: number | null; error: unknown }>,
        (adminSupabase as any).from('repairs').select('*', { count: 'exact', head: true }).eq('branch_id', branchId).not('status', 'in', TERMINAL_IN).or(`is_rush.eq.true,created_at.lt.${urgentCutoff}`) as Promise<{ count: number | null; error: unknown }>,
        adminSupabase.from('inventory').select('id, quantity, low_stock_alert, variant_id, products!inner(name, sku, is_active, is_service, has_variants)').eq('branch_id', branchId),
        adminSupabase.from('repairs').select('id, job_number, device_brand, device_model, issue, status, created_at, is_rush, customers(first_name,last_name)').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(20),
        adminSupabase.from('repair_status_history').select('id, new_status, note, created_at, repairs!inner(id, job_number, device_brand, device_model), profiles!changed_by(full_name)').eq('repairs.branch_id', branchId).order('created_at', { ascending: false }).limit(20),
        adminSupabase.from('repairs').select('id, status, deposit_paid, actual_cost, estimated_cost, refund_amount').eq('branch_id', branchId).gte('created_at', periodStart),
        adminSupabase.from('sale_items').select('quantity, product_id, products!product_id(cost_price), sales!inner(branch_id, created_at)').eq('sales.branch_id', branchId).gte('sales.created_at', periodStart),
        adminSupabase.from('repair_items').select('quantity, unit_cost, repairs!inner(branch_id, created_at, status, deposit_paid)').eq('repairs.branch_id', branchId).gte('repairs.created_at', periodStart),
        adminSupabase.from('sales').select('total, payment_method, payment_splits').eq('branch_id', branchId).gte('created_at', todayStart),
        // Amounts actually charged through POS for repair-linked line items —
        // takes priority over the repairs-table fallback below.
        (adminSupabase as any).from('sale_items').select('repair_id, total, sales!inner(is_refund, branch_id, created_at)').eq('sales.branch_id', branchId).gte('sales.created_at', periodStart).not('repair_id', 'is', null),
        // Cash In adds to Sales revenue, Cash Out subtracts.
        (adminSupabase as any).from('cash_movements').select('type, amount').eq('branch_id', branchId).gte('created_at', periodStart),
      ])

      const sales             = salesRes.data ?? []
      const expenses          = expensesRes.data ?? []
      const inventory         = inventoryRes.data ?? []
      const repairsRevenueRows = repairsRevenueRes.data ?? []
      const cashNet = ((cashMovementsRes.data ?? []) as any[]).reduce(
        (s, r) => s + (r.type === 'cash_in' ? (r.amount ?? 0) : -(r.amount ?? 0)), 0
      )

      const posRepairAmounts = new Map<string, number>()
      for (const row of (posRepairAmountsRes.data ?? []) as any[]) {
        const rid = row.repair_id
        if (!rid) continue
        const amt = row.sales?.is_refund ? -(row.total ?? 0) : (row.total ?? 0)
        posRepairAmounts.set(rid, (posRepairAmounts.get(rid) ?? 0) + amt)
      }

      const repairsCompleted = repairsRevenueRows.filter((r: any) => isTerminal((r.status ?? '').toLowerCase())).length
      const salesCogs = ((salesCogsRes.data ?? []) as any[]).reduce((s, item) => s + (item.quantity ?? 0) * (item.products?.cost_price ?? 0), 0)
      const repairsPartsCost = ((repairsPartsRes.data ?? []) as any[]).reduce((s, item) => {
        const repairStatus = (item.repairs?.status ?? '').toLowerCase()
        const depositPaid  = item.repairs?.deposit_paid ?? 0
        if (repairStatus === 'refunded') return s
        if (isTerminal(repairStatus))    return s + (item.quantity ?? 0) * (item.unit_cost ?? 0)
        if (depositPaid > 0)             return s + (item.quantity ?? 0) * (item.unit_cost ?? 0)
        return s
      }, 0)

      const recentRepairs = (recentRepairsRes.data ?? []).map((r) => {
        const customer = r.customers as { first_name: string; last_name?: string } | null
        return {
          id: r.id,
          job_number: r.job_number,
          device: [r.device_brand, r.device_model].filter(Boolean).join(' ') || 'Unknown Device',
          issue: r.issue,
          status: r.status,
          created_at: r.created_at,
          customer_name: customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') : 'Walk-in',
        }
      })

      const recentActivity = (activityRes.data ?? []).map((a) => {
        const r = a.repairs as { id: string; job_number: string; device_brand: string; device_model: string } | null
        const p = a.profiles as { full_name: string } | null
        return {
          id: a.id,
          status: a.new_status as string,
          note: a.note as string | null,
          created_at: a.created_at as string | null,
          repair_id: r?.id ?? null,
          job_number: r?.job_number ?? null,
          device: [r?.device_brand, r?.device_model].filter(Boolean).join(' ') || 'Unknown Device',
          changed_by: p?.full_name ?? null,
        }
      })

      const todaySales = (todaySalesRes.data ?? []) as any[]
      let todayCashRevenue = 0
      let todayCardRevenue = 0
      for (const sale of todaySales) {
        const method = sale.payment_method as string
        const total  = sale.total as number ?? 0
        const splits = sale.payment_splits as { method: string; amount: number }[] | null
        if (method === 'split' && splits?.length) {
          for (const s of splits) {
            if (s.method === 'cash') todayCashRevenue += s.amount
            else if (s.method === 'card') todayCardRevenue += s.amount
          }
        } else if (method === 'cash') {
          todayCashRevenue += total
        } else if (method === 'card') {
          todayCardRevenue += total
        }
      }

      const lowStockItems = (inventory as any[])
        .filter((i) => {
          const p = i.products
          if (!i.variant_id && p?.has_variants) return false
          return i.quantity <= (i.low_stock_alert ?? 5)
        })
        .sort((a, b) => a.quantity - b.quantity)
        .map((i) => ({
          id: i.id,
          name: i.products?.name ?? 'Unknown Product',
          sku: i.products?.sku ?? null,
          quantity: i.quantity,
          low_stock_alert: i.low_stock_alert ?? 5,
        }))
      const lowStockCount = lowStockItems.length
      // Cash In adds to Sales revenue, Cash Out subtracts — baked directly
      // into total_sales so every consumer of this stat (the "Sales Revenue"
      // card, net_profit, sales_profit) reflects it automatically.
      const totalSales    = sales.reduce((s, r) => s + (r.total ?? 0), 0) + cashNet
      const totalExpenses = expenses.reduce((s, r) => s + (r.amount ?? 0), 0)
      const repairsRevenue = repairsRevenueRows.reduce((s, r) => {
        const row = r as any
        const posAmt = posRepairAmounts.get(row.id)
        if (posAmt !== undefined) return s + posAmt

        const status   = (row.status ?? '').toLowerCase()
        const deposit  = row.deposit_paid  ?? 0
        const fullCost = row.actual_cost   ?? row.estimated_cost ?? 0
        const refund   = row.refund_amount ?? 0
        if (isTerminal(status))    return s + fullCost
        if (status === 'refunded') return s + Math.max(0, deposit - refund)
        return s + deposit
      }, 0)

      const stats = {
        total_sales:           totalSales,
        sales_count:           sales.length,
        repairs_total:         repairsTotalRes.count  ?? 0,
        repairs_open:          repairsOpenRes.count   ?? 0,
        repairs_completed:     repairsCompleted,
        repairs_urgent:        repairsUrgentRes.count ?? 0,
        total_expenses:        totalExpenses,
        low_stock_count:       lowStockCount,
        net_profit:            totalSales + repairsRevenue - totalExpenses,
        repairs_revenue:       repairsRevenue,
        sales_profit:          totalSales - salesCogs,
        repairs_profit:        repairsRevenue - repairsPartsCost,
        today_cash_revenue:    todayCashRevenue,
        today_card_revenue:    todayCardRevenue,
      }

      return ok({ stats, recentRepairs, recentActivity, lowStockItems })
    } catch (err) {
      return serverError('Failed to load dashboard', err)
    }
  },

  // ── Slow path: branch revenue breakdown (owners only) ────────────────────
  async getRevenue(request: NextRequest, ctx: RequestContext) {
    const isOwner = ['business_owner', 'super_admin'].includes(ctx.auth.role)
    if (!isOwner) return ok({ branchRevenue: [] })

    try {
      const { data: branches } = await adminSupabase
        .from('branches')
        .select('id, name')
        .eq('business_id', ctx.businessId)
        .eq('is_active', true)

      if (!branches || branches.length === 0) return ok({ branchRevenue: [] })

      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const { data: rawSales } = await adminSupabase
        .from('sales')
        .select('branch_id, total')
        .in('branch_id', branches.map(b => b.id))
        .gte('created_at', startOfMonth)

      const totalsByBranch = (rawSales ?? []).reduce((acc, row) => {
        acc[row.branch_id] = (acc[row.branch_id] ?? 0) + (row.total ?? 0)
        return acc
      }, {} as Record<string, number>)

      const branchRevenue = branches.map(b => ({
        branchId:   b.id,
        branchName: b.name,
        total:      totalsByBranch[b.id] ?? 0,
      }))

      return ok({ branchRevenue })
    } catch (err) {
      return serverError('Failed to load revenue', err)
    }
  },

  // ── Legacy full path (backward compat) ───────────────────────────────────
  async get(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const isOwner  = ['business_owner', 'super_admin'].includes(ctx.auth.role)

    const period      = searchParams.get('period') ?? 'month'
    const periodStart = getPeriodStart(period)

    try {
      const urgentCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      const TERMINAL_IN  = '(repaired,collected,unrepairable,refunded)'

      const [
        salesRes,
        expensesRes,
        repairsTotalRes,
        repairsOpenRes,
        repairsUrgentRes,
        inventoryRes,
        recentRepairsRes,
        activityRes,
        repairsRevenueRes,
        salesCogsRes,
        repairsPartsRes,
        posRepairAmountsRes,
        cashMovementsRes,
      ] = await Promise.all([
        // Sales in selected period
        adminSupabase
          .from('sales')
          .select('id, total, created_at')
          .eq('branch_id', branchId)
          .gte('created_at', periodStart),

        // Expenses in selected period
        adminSupabase
          .from('expenses')
          .select('amount')
          .eq('branch_id', branchId)
          .gte('expense_date', periodStart),

        // COUNT: total repairs (HEAD — no row data transferred)
        (adminSupabase as any)
          .from('repairs')
          .select('*', { count: 'exact', head: true })
          .eq('branch_id', branchId) as Promise<{ count: number | null; error: unknown }>,

        // COUNT: open repairs
        (adminSupabase as any)
          .from('repairs')
          .select('*', { count: 'exact', head: true })
          .eq('branch_id', branchId)
          .not('status', 'in', TERMINAL_IN) as Promise<{ count: number | null; error: unknown }>,

        // COUNT: urgent repairs (rush OR sitting > 3 days, still open)
        (adminSupabase as any)
          .from('repairs')
          .select('*', { count: 'exact', head: true })
          .eq('branch_id', branchId)
          .not('status', 'in', TERMINAL_IN)
          .or(`is_rush.eq.true,created_at.lt.${urgentCutoff}`) as Promise<{ count: number | null; error: unknown }>,

        // Low stock alerts — inventory is typically small per branch
        adminSupabase
          .from('inventory')
          .select('id, quantity, low_stock_alert, variant_id, products!inner(is_active, is_service, has_variants)')
          .eq('branch_id', branchId),

        // Recent repair tickets (last 20)
        adminSupabase
          .from('repairs')
          .select('id, job_number, device_brand, device_model, issue, status, created_at, is_rush, customers(first_name,last_name)')
          .eq('branch_id', branchId)
          .order('created_at', { ascending: false })
          .limit(20),

        // Recent repair status activity (last 20)
        adminSupabase
          .from('repair_status_history')
          .select('id, new_status, note, created_at, repairs!inner(id, job_number, device_brand, device_model), profiles!changed_by(full_name)')
          .eq('repairs.branch_id', branchId)
          .order('created_at', { ascending: false })
          .limit(20),

        // Repair revenue this month
        adminSupabase
          .from('repairs')
          .select('id, status, deposit_paid, actual_cost, estimated_cost, refund_amount')
          .eq('branch_id', branchId)
          .gte('created_at', periodStart),

        // COGS: sale_items × product cost_price for this period/branch
        adminSupabase
          .from('sale_items')
          .select('quantity, product_id, products!product_id(cost_price), sales!inner(branch_id, created_at)')
          .eq('sales.branch_id', branchId)
          .gte('sales.created_at', periodStart),

        // Repair parts cost
        adminSupabase
          .from('repair_items')
          .select('quantity, unit_cost, repairs!inner(branch_id, created_at, status, deposit_paid)')
          .eq('repairs.branch_id', branchId)
          .gte('repairs.created_at', periodStart),

        // Amounts actually charged through POS for repair-linked line items —
        // takes priority over the repairs-table fallback below.
        (adminSupabase as any)
          .from('sale_items')
          .select('repair_id, total, sales!inner(is_refund, branch_id, created_at)')
          .eq('sales.branch_id', branchId)
          .gte('sales.created_at', periodStart)
          .not('repair_id', 'is', null),

        // Cash In adds to Sales revenue, Cash Out subtracts.
        (adminSupabase as any)
          .from('cash_movements')
          .select('type, amount')
          .eq('branch_id', branchId)
          .gte('created_at', periodStart),
      ])

      const sales              = salesRes.data ?? []
      const expenses           = expensesRes.data ?? []
      const inventory          = inventoryRes.data ?? []
      const repairsRevenueRows = repairsRevenueRes.data ?? []
      const cashNet = ((cashMovementsRes.data ?? []) as any[]).reduce(
        (s, r) => s + (r.type === 'cash_in' ? (r.amount ?? 0) : -(r.amount ?? 0)), 0
      )

      const posRepairAmounts = new Map<string, number>()
      for (const row of (posRepairAmountsRes.data ?? []) as any[]) {
        const rid = row.repair_id
        if (!rid) continue
        const amt = row.sales?.is_refund ? -(row.total ?? 0) : (row.total ?? 0)
        posRepairAmounts.set(rid, (posRepairAmounts.get(rid) ?? 0) + amt)
      }

      const repairsCompleted = repairsRevenueRows.filter((r: any) => isTerminal((r.status ?? '').toLowerCase())).length
      const salesCogs = ((salesCogsRes.data ?? []) as any[]).reduce((s, item) => {
        return s + (item.quantity ?? 0) * (item.products?.cost_price ?? 0)
      }, 0)
      const repairsPartsCost = ((repairsPartsRes.data ?? []) as any[]).reduce((s, item) => {
        const repairStatus = (item.repairs?.status ?? '').toLowerCase()
        const depositPaid  = item.repairs?.deposit_paid ?? 0
        if (repairStatus === 'refunded') return s
        if (isTerminal(repairStatus))    return s + (item.quantity ?? 0) * (item.unit_cost ?? 0)
        if (depositPaid > 0)             return s + (item.quantity ?? 0) * (item.unit_cost ?? 0)
        return s
      }, 0)
      const recentRepairs = (recentRepairsRes.data ?? []).map((r) => {
        const customer = r.customers as { first_name: string; last_name?: string } | null
        const customerName = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(' ') : null
        return {
          id: r.id,
          job_number: r.job_number,
          device: [r.device_brand, r.device_model].filter(Boolean).join(' ') || 'Unknown Device',
          issue: r.issue,
          status: r.status,
          created_at: r.created_at,
          customer_name: customerName ?? 'Walk-in',
        }
      })

      const recentActivity = (activityRes.data ?? []).map((a) => {
        const r = a.repairs as { id: string; job_number: string; device_brand: string; device_model: string } | null
        const p = a.profiles as { full_name: string } | null
        return {
          id: a.id,
          status: a.new_status as string,
          note: a.note as string | null,
          created_at: a.created_at as string | null,
          repair_id: r?.id ?? null,
          job_number: r?.job_number ?? null,
          device: [r?.device_brand, r?.device_model].filter(Boolean).join(' ') || 'Unknown Device',
          changed_by: p?.full_name ?? null,
        }
      })

      const lowStockCount = (inventory as any[]).filter((i) => {
        if (!i.variant_id && (i.products as any)?.has_variants) return false
        return i.quantity <= (i.low_stock_alert ?? 5)
      }).length

      const totalSales    = sales.reduce((s, r) => s + (r.total ?? 0), 0) + cashNet
      const totalExpenses = expenses.reduce((s, r) => s + (r.amount ?? 0), 0)
      const repairsRevenue = repairsRevenueRows.reduce((s, r) => {
          const row = r as any
          const posAmt = posRepairAmounts.get(row.id)
          if (posAmt !== undefined) return s + posAmt

          const status   = (row.status ?? '').toLowerCase()
          const deposit  = row.deposit_paid  ?? 0
          const fullCost = row.actual_cost   ?? row.estimated_cost ?? 0
          const refund   = row.refund_amount ?? 0
          if (isTerminal(status))    return s + fullCost
          if (status === 'refunded') return s + Math.max(0, deposit - refund)
          return s + deposit
        }, 0)

      const stats = {
        total_sales:       totalSales,
        sales_count:       sales.length,
        repairs_total:     repairsTotalRes.count  ?? 0,
        repairs_open:      repairsOpenRes.count   ?? 0,
        repairs_completed: repairsCompleted,
        repairs_urgent:    repairsUrgentRes.count ?? 0,
        total_expenses:    totalExpenses,
        low_stock_count:   lowStockCount,
        net_profit:        totalSales + repairsRevenue - totalExpenses,
        repairs_revenue:   repairsRevenue,
        sales_profit:      totalSales - salesCogs,
        repairs_profit:    repairsRevenue - repairsPartsCost,
      }

      // Branch revenue breakdown (owner only)
      let branchRevenue: { branchId: string; branchName: string; total: number }[] = []
      if (isOwner) {
        const { data: branches } = await adminSupabase
          .from('branches')
          .select('id, name')
          .eq('business_id', ctx.businessId)
          .eq('is_active', true)

        if (branches && branches.length > 0) {
          const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
          const { data: rawSales } = await adminSupabase
            .from('sales')
            .select('branch_id, total')
            .in('branch_id', branches.map(b => b.id))
            .gte('created_at', startOfMonth)

          const totalsByBranch = (rawSales ?? []).reduce((acc, row) => {
            acc[row.branch_id] = (acc[row.branch_id] ?? 0) + (row.total ?? 0)
            return acc
          }, {} as Record<string, number>)

          branchRevenue = branches.map(b => ({
            branchId:   b.id,
            branchName: b.name,
            total:      totalsByBranch[b.id] ?? 0,
          }))
        }
      }

      return ok({ stats, branchRevenue, recentRepairs, recentActivity })
    } catch (err) {
      return serverError('Failed to load dashboard', err)
    }
  },
}
