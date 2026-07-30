import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'
import { isTerminalRepairStatus, buildPosOverrideMap, computeRepairRevenue, computeRepairPartsCost, filterCompletedRepairsInPeriod } from '@/backend/services/repair-financials.service'

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

  try {
    const [allRepairsRes, periodRepairsRes, partsRes, posSaleItemsRes, repairPaymentsRes, completedRepairsRes, completedPartsRes, posSaleItemsAllTimeRes] = await Promise.all([
      // ALL repairs — Open Jobs is a live operational count, not period-filtered
      db.from('repairs')
        .select('id, status, created_at, is_rush')
        .eq('branch_id', branchId),

      // Period repairs — Total, Completed, Revenue, Profit are period-filtered
      db.from('repairs')
        .select('id, status, created_at, deposit_paid, actual_cost, estimated_cost, discount_amount, refund_amount')
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

      // ── Additional/secondary figure only (does not affect repairs_revenue/
      // repairs_profit above): completed-in-period, by completion date — the
      // same definition get_profit_loss (P&L report) uses. Exposed as
      // repairs_revenue_completed/repairs_profit_completed for cross-reference.
      db.from('repairs')
        .select('id, status, updated_at, deposit_paid, actual_cost, estimated_cost, discount_amount, refund_amount')
        .eq('branch_id', branchId)
        .gte('updated_at', periodStart),

      db.from('repair_items')
        .select('quantity, unit_cost, repairs!inner(branch_id, updated_at, status, deposit_paid)')
        .eq('repairs.branch_id', branchId)
        .gte('repairs.updated_at', periodStart),

      // POS override for the completed-in-period figure — unrestricted by
      // sale date (matches get_profit_loss): a repair's lifetime POS total
      // counts once the repair itself completes in-period.
      db.from('sale_items')
        .select('repair_id, total, sales!inner(is_refund, branch_id)')
        .eq('sales.branch_id', branchId)
        .not('repair_id', 'is', null),
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
    const posRepairAmounts = buildPosOverrideMap((posSaleItemsRes.data ?? []) as any[])

    // Open Jobs — always all-time current state, never filtered by period
    const openJobs   = allRepairs.filter(r => !isTerminalRepairStatus(r.status))
    const urgentJobs = openJobs.filter(r =>
      r.is_rush === true || new Date(r.created_at) < new Date(urgentCutoff)
    )

    // Total / Completed — period-filtered (repairs created in selected period)
    const completedJobs = periodRepairs.filter(r => isTerminalRepairStatus(r.status))

    const revenue = periodRepairs.reduce((sum: number, r: any) => sum + computeRepairRevenue(r, posRepairAmounts), 0)

    const partsCost = computeRepairPartsCost((partsRes.data ?? []) as any[])

    // ── Secondary/reference figure: completed-in-period (matches P&L) ──────
    // Purely additive — does not change repairs_revenue/repairs_profit above.
    const posRepairAmountsAllTime = buildPosOverrideMap((posSaleItemsAllTimeRes.data ?? []) as any[])
    const completedRepairs = filterCompletedRepairsInPeriod(
      (completedRepairsRes.data ?? []) as any[],
      periodStart
    )
    const revenueCompleted = completedRepairs.reduce(
      (sum: number, r: any) => sum + computeRepairRevenue(r, posRepairAmountsAllTime), 0
    )
    const completedParts = ((completedPartsRes.data ?? []) as any[])
      .filter((item) => isTerminalRepairStatus(item.repairs?.status))
    const partsCostCompleted = computeRepairPartsCost(completedParts)

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
      // Reference figures only — completed-in-period, matching the P&L
      // report's definition. Do not replace repairs_revenue/repairs_profit.
      repairs_revenue_completed: revenueCompleted,
      repairs_profit_completed:  revenueCompleted - partsCostCompleted,
    })
  } catch (err) {
    return serverError('Failed to fetch repair stats', err)
  }
}, { requiredRole: 'cashier' })
