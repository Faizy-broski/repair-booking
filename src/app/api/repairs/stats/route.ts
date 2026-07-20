import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'

export const GET = withMiddleware(async (req, ctx) => {
  const branchId = req.nextUrl.searchParams.get('branch_id') ?? ctx.auth.branchId
  if (!branchId) return serverError('branch_id required', null)

  const urgentCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  const period       = req.nextUrl.searchParams.get('period') ?? 'month'
  const now          = new Date()
  const periodStart  = period === 'year'    ? new Date(now.getFullYear(), 0, 1).toISOString()
                     : period === '6months' ? new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString()
                     : period === '3months' ? new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString()
                     : period === 'today'   ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
                     :                        new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const db           = adminSupabase as any

  const TERMINAL_NAMES      = new Set(['repaired', 'collected', 'unrepairable', 'refunded', 'completed', 'done', 'fixed', 'closed', 'picked_up', 'handover'])
  const COMPLETION_KEYWORDS = ['complet', 'done', 'fixed', 'pick', 'closed', 'resolv', 'finish', 'collect', 'handover']
  const isTerminal = (s: string) => {
    const lo = s.toLowerCase().trim()
    return TERMINAL_NAMES.has(lo) || COMPLETION_KEYWORDS.some(kw => lo.includes(kw))
  }

  try {
    const [allRepairsRes, periodRepairsRes, partsRes, posSaleItemsRes, repairPaymentsRes] = await Promise.all([
      // ALL repairs — Open Jobs is a live operational count, not period-filtered
      db.from('repairs')
        .select('id, status, created_at, is_rush')
        .eq('branch_id', branchId),

      // Period repairs — Total, Completed, Revenue, Profit are period-filtered
      db.from('repairs')
        .select('id, status, created_at, deposit_paid, actual_cost, estimated_cost, refund_amount')
        .eq('branch_id', branchId)
        .gte('created_at', periodStart),

      db.from('repair_items')
        .select('quantity, unit_cost, repairs!inner(branch_id, created_at, status, deposit_paid)')
        .eq('repairs.branch_id', branchId)
        .gte('repairs.created_at', periodStart),

      // Amounts actually charged through POS for repair-linked line items —
      // takes priority over the repairs-table fallback below so POS-made
      // repair sales show the real charged amount instead of a stale one.
      db.from('sale_items')
        .select('repair_id, total, sales!inner(is_refund, branch_id, created_at)')
        .eq('sales.branch_id', branchId)
        .gte('sales.created_at', periodStart)
        .not('repair_id', 'is', null),

      // Per-payment-event tender breakdown for the Cash vs Card stat tile
      db.from('repair_payments')
        .select('amount, method, repairs!inner(branch_id)')
        .eq('repairs.branch_id', branchId)
        .gte('created_at', periodStart),
    ])

    const allRepairs:    any[] = allRepairsRes.data    ?? []
    const periodRepairs: any[] = periodRepairsRes.data ?? []

    let cashDeposits = 0
    let cardDeposits = 0
    let otherDeposits = 0
    for (const row of (repairPaymentsRes.data ?? []) as any[]) {
      const amt = row.amount ?? 0
      if (row.method === 'cash') cashDeposits += amt
      else if (row.method === 'card') cardDeposits += amt
      else otherDeposits += amt
    }

    // Net amount actually charged through POS per repair (refund sales subtract)
    const posRepairAmounts = new Map<string, number>()
    for (const row of (posSaleItemsRes.data ?? []) as any[]) {
      const rid = row.repair_id
      if (!rid) continue
      const amt = row.sales?.is_refund ? -(row.total ?? 0) : (row.total ?? 0)
      posRepairAmounts.set(rid, (posRepairAmounts.get(rid) ?? 0) + amt)
    }

    // Open Jobs — always all-time current state, never filtered by period
    const openJobs   = allRepairs.filter(r => !isTerminal(r.status ?? ''))
    const urgentJobs = openJobs.filter(r =>
      r.is_rush === true || new Date(r.created_at) < new Date(urgentCutoff)
    )

    // Total / Completed — period-filtered (repairs created in selected period)
    const completedJobs = periodRepairs.filter(r => isTerminal(r.status ?? ''))

    const revenue = periodRepairs.reduce((sum: number, r: any) => {
      const posAmt = posRepairAmounts.get(r.id)
      if (posAmt !== undefined) return sum + posAmt

      const s        = (r.status ?? '').toLowerCase().trim()
      const deposit  = r.deposit_paid  ?? 0
      const fullCost = r.actual_cost   ?? r.estimated_cost ?? 0
      const refund   = r.refund_amount ?? 0
      if (isTerminal(s) && s !== 'refunded') return sum + fullCost
      if (s === 'refunded')                  return sum + Math.max(0, deposit - refund)
      return sum + deposit
    }, 0)

    const partsCost = (partsRes.data ?? []).reduce((sum: number, item: any) => {
      const repairStatus = (item.repairs?.status ?? '').toLowerCase().trim()
      const depositPaid  = item.repairs?.deposit_paid ?? 0
      if (repairStatus === 'refunded')  return sum
      if (isTerminal(repairStatus))     return sum + (item.quantity ?? 0) * (item.unit_cost ?? 0)
      if (depositPaid > 0)              return sum + (item.quantity ?? 0) * (item.unit_cost ?? 0)
      return sum
    }, 0)

    return ok({
      repairs_total:     periodRepairs.length,   // created in selected period
      repairs_open:      openJobs.length,         // ALL TIME — live operational count
      repairs_completed: completedJobs.length,    // created in period that are terminal
      repairs_urgent:    urgentJobs.length,
      repairs_revenue:   revenue,
      repairs_profit:    revenue - partsCost,
      repairs_cash_deposits:  cashDeposits,
      repairs_card_deposits:  cardDeposits,
      repairs_other_deposits: otherDeposits,
    })
  } catch (err) {
    return serverError('Failed to fetch repair stats', err)
  }
}, { requiredRole: 'cashier' })
