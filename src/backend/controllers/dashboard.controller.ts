import { NextRequest } from 'next/server'
import { type RequestContext } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

export const DashboardController = {
  async get(request: NextRequest, ctx: RequestContext) {
    const { searchParams } = request.nextUrl
    const branchId = searchParams.get('branch_id') ?? ctx.auth.branchId ?? ''
    const isOwner = ['business_owner', 'super_admin'].includes(ctx.auth.role)

    try {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

      const [salesRes, repairsRes, expensesRes, inventoryRes] = await Promise.all([
        // Total sales this month
        adminSupabase
          .from('sales')
          .select('total, created_at')
          .eq('branch_id', branchId)
          .gte('created_at', monthStart),

        // Open repairs
        adminSupabase
          .from('repairs')
          .select('id, status')
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
      ])

      const sales = salesRes.data ?? []
      const repairs = repairsRes.data ?? []
      const expenses = expensesRes.data ?? []
      const inventory = inventoryRes.data ?? []

      const lowStockCount = inventory.filter(
        (i) => i.quantity <= (i.low_stock_alert ?? 5)
      ).length

      const stats = {
        total_sales: sales.reduce((s, r) => s + (r.total ?? 0), 0),
        sales_count: sales.length,
        repairs_open: repairs.filter((r) => r.status !== 'collected').length,
        repairs_completed: repairs.filter((r) => r.status === 'repaired').length,
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

      return ok({ stats, branchRevenue })
    } catch (err) {
      return serverError('Failed to load dashboard', err)
    }
  },
}
