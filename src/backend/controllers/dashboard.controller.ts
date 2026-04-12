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

      const [salesRes, repairsRes, expensesRes, inventoryRes, recentRepairsRes, activityRes] = await Promise.all([
        // Total sales this month
        adminSupabase
          .from('sales')
          .select('total, created_at')
          .eq('branch_id', branchId)
          .gte('created_at', monthStart),

        // Open repairs
        adminSupabase
          .from('repairs')
          .select('id, status, created_at, is_rush')
          .eq('branch_id', branchId)
          .not('status', 'in', '("collected","unrepairable")'),

        // This month's expenses
        adminSupabase
          .from('expenses')
          .select('amount')
          .eq('branch_id', branchId)
          .gte('expense_date', monthStart),

        // Low stock alerts
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
      const repairs = repairsRes.data ?? []
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

      // Urgent = active rush jobs OR active repairs sitting for more than 3 days
      const urgentCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      const repairsUrgent = repairs.filter(
        (r) => !['repaired', 'collected', 'unrepairable'].includes(r.status) &&
          ((r as any).is_rush || (r.created_at ?? '') < urgentCutoff)
      ).length

      const stats = {
        total_sales: sales.reduce((s, r) => s + (r.total ?? 0), 0),
        sales_count: sales.length,
        repairs_open: repairs.filter((r) => !['repaired', 'collected', 'unrepairable'].includes(r.status)).length,
        repairs_completed: repairs.filter((r) => r.status === 'repaired').length,
        repairs_urgent: repairsUrgent,
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
