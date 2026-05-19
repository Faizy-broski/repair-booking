import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

/**
 * GET /api/repairs/stats?branch_id=...
 *
 * Lightweight stats-only endpoint for the repairs page header cards.
 * All queries run in parallel — no joins, no payload rows, just counts and sums.
 * Kept separate from /api/dashboard so mutations can invalidate only this
 * without triggering the heavier dashboard refetch.
 */
export const GET = withMiddleware(async (req, ctx) => {
  const branchId = req.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId
  if (!branchId) return serverError('branch_id required', null)

  const TERMINAL     = '(repaired,collected,unrepairable,refunded)'
  const urgentCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const period       = req.nextUrl.searchParams.get('period') ?? 'month'
  const now          = new Date()
  const periodStart  = period === 'year'    ? new Date(now.getFullYear(), 0, 1).toISOString()
                     : period === '6months' ? new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString()
                     : period === '3months' ? new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString()
                     :                        new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const db           = adminSupabase as any

  const TERMINAL_NAMES      = new Set(['repaired', 'collected', 'unrepairable'])
  const COMPLETION_KEYWORDS = ['complet', 'done', 'fixed', 'pick', 'closed', 'resolv', 'finish', 'collect', 'handover']
  const isTerminal = (s: string) => TERMINAL_NAMES.has(s) || COMPLETION_KEYWORDS.some(kw => s.includes(kw))

  try {
    const [totalRes, openRes, urgentRes, revenueRes, partsRes] = await Promise.all([
      db.from('repairs').select('*', { count: 'exact', head: true }).eq('branch_id', branchId),
      db.from('repairs').select('*', { count: 'exact', head: true }).eq('branch_id', branchId).not('status', 'in', TERMINAL),
      db.from('repairs').select('*', { count: 'exact', head: true }).eq('branch_id', branchId).not('status', 'in', TERMINAL).or(`is_rush.eq.true,created_at.lt.${urgentCutoff}`),
      db.from('repairs').select('status, deposit_paid, actual_cost, estimated_cost, refund_amount').eq('branch_id', branchId).gte('created_at', periodStart),
      db.from('repair_items')
        .select('quantity, unit_cost, repairs!inner(branch_id, created_at, status, deposit_paid)')
        .eq('repairs.branch_id', branchId)
        .gte('repairs.created_at', periodStart),
    ])

    const rows: any[] = revenueRes.data ?? []

    const repairsCompleted = rows.filter((r: any) => isTerminal((r.status ?? '').toLowerCase())).length

    const revenue = rows.reduce((sum: number, r: any) => {
      const s        = (r.status ?? '').toLowerCase()
      const deposit  = r.deposit_paid  ?? 0
      const fullCost = r.actual_cost   ?? r.estimated_cost ?? 0
      const refund   = r.refund_amount ?? 0
      // Terminal (complete/repaired/collected): full charge, no refund deduction
      // — refund_amount only applies when status is explicitly 'refunded'
      if (isTerminal(s))    return sum + fullCost
      if (s === 'refunded') return sum + Math.max(0, deposit - refund)
      return sum + deposit
    }, 0)

    // Parts cost rules:
    //   refunded → skip (device returned, job cancelled)
    //   terminal (completed/collected) → include
    //   open + deposit > 0 → include (work in progress, parts used)
    //   open + deposit = 0 → skip (nothing collected, nothing counted)
    const partsCost = (partsRes.data ?? []).reduce((sum: number, item: any) => {
      const repairStatus = (item.repairs?.status ?? '').toLowerCase()
      const depositPaid  = item.repairs?.deposit_paid ?? 0
      if (repairStatus === 'refunded')                       return sum
      if (isTerminal(repairStatus))                          return sum + (item.quantity ?? 0) * (item.unit_cost ?? 0)
      if (depositPaid > 0)                                   return sum + (item.quantity ?? 0) * (item.unit_cost ?? 0)
      return sum
    }, 0)

    return ok({
      repairs_total:     totalRes.count ?? 0,
      repairs_open:      openRes.count  ?? 0,
      repairs_completed: repairsCompleted,
      repairs_urgent:    urgentRes.count ?? 0,
      repairs_revenue:   revenue,
      repairs_profit:    revenue - partsCost,
    })
  } catch (err) {
    return serverError('Failed to fetch repair stats', err)
  }
}, { requiredRole: 'cashier' })
