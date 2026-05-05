import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

export const DashboardController = {
  async get(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? null
    const isOwner = ['business_owner', 'super_admin'].includes(ctx.auth.role)

    try {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const urgentCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      const TERMINAL_IN = '(repaired,collected,unrepairable)'

      const [
        salesRes,
        expensesRes,
        repairsTotalRes,
        repairsOpenRes,
        repairsCompletedRes,
        repairsUrgentRes,
        inventoryRes,
        recentRepairsRes,
        activityRes,
      ] = await Promise.all([
        // Total sales this month
        adminSupabase
          .from('sales')
          .select('total, created_at')
          .eq('branch_id', branchId)
          .gte('created_at', monthStart),

        // This month's expenses
        adminSupabase
          .from('expenses')
          .select('amount')
          .eq('branch_id', branchId)
          .gte('expense_date', monthStart),

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

        // COUNT: completed repairs
        (adminSupabase as any)
          .from('repairs')
          .select('*', { count: 'exact', head: true })
          .eq('branch_id', branchId)
          .eq('status', 'repaired') as Promise<{ count: number | null; error: unknown }>,

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
          .select('id, quantity, low_stock_alert')
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
      ])

      const sales = salesRes.data ?? []
      const expenses = expensesRes.data ?? []
      const inventory = inventoryRes.data ?? []
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

      const lowStockCount = inventory.filter(
        (i) => i.quantity <= (i.low_stock_alert ?? 5)
      ).length

      const stats = {
        total_sales: sales.reduce((s, r) => s + (r.total ?? 0), 0),
        sales_count: sales.length,
        repairs_total:     repairsTotalRes.count     ?? 0,
        repairs_open:      repairsOpenRes.count      ?? 0,
        repairs_completed: repairsCompletedRes.count ?? 0,
        repairs_urgent:    repairsUrgentRes.count    ?? 0,
        total_expenses: expenses.reduce((s, r) => s + (r.amount ?? 0), 0),
        low_stock_count: lowStockCount,
      }

      // Branch revenue breakdown (owner only)
      let branchRevenue: { branchId: string; branchName: string; total: number }[] = []
      if (isOwner) {
        const { data: branches } = await adminSupabase
          .from('branches')
          .select('id, name')
          .eq('business_id', ctx.businessId)
          .eq('is_active', true)

        if (branches) {
          const branchSales = await Promise.all(
            branches.map(async (b) => {
              const { data } = await adminSupabase
                .from('sales')
                .select('total')
                .eq('branch_id', b.id)
                .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
              return {
                branchId: b.id,
                branchName: b.name,
                total: (data ?? []).reduce((s, r) => s + (r.total ?? 0), 0),
              }
            })
          )
          branchRevenue = branchSales
        }
      }

      return ok({ stats, branchRevenue, recentRepairs, recentActivity })
    } catch (err) {
      return serverError('Failed to load dashboard', err)
    }
  },
}
