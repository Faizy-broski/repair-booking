// Shared repair revenue/profit primitives.
//
// Repair statuses have no fixed enum (each business defines its own custom
// status names — see migrations 064/066), so "is this repair finished?" is a
// heuristic everywhere: an exact-name set plus fuzzy keyword matching. This
// heuristic, the POS-override rule (a repair actually paid through the POS
// till uses that real charged amount instead of the repairs-table columns),
// and the per-repair revenue/parts-cost formulas were previously copy-pasted
// across dashboard.controller.ts, repairs/stats/route.ts and repair.service.ts
// and had drifted out of sync. This module is the single source of truth for
// all of them.

export const TERMINAL_STATUS_NAMES = new Set([
  'repaired', 'collected', 'unrepairable', 'refunded', 'completed',
  'done', 'fixed', 'closed', 'picked_up', 'handover',
])

export const TERMINAL_STATUS_KEYWORDS = [
  'complet', 'done', 'fixed', 'pick', 'closed', 'resolv', 'finish', 'collect', 'handover',
]

export function isTerminalRepairStatus(status: string | null | undefined): boolean {
  const lo = (status ?? '').toLowerCase().trim()
  return TERMINAL_STATUS_NAMES.has(lo) || TERMINAL_STATUS_KEYWORDS.some((kw) => lo.includes(kw))
}

export interface PosOverrideRow {
  repair_id: string | null
  total: number | null
  sales?: { is_refund?: boolean | null } | null
}

// Net amount actually charged through POS per repair (refund sales subtract).
// Takes priority over the repairs-table fallback (deposit_paid/actual_cost)
// whenever a repair was paid through the till.
export function buildPosOverrideMap(rows: PosOverrideRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const rid = row.repair_id
    if (!rid) continue
    const amt = row.sales?.is_refund ? -(row.total ?? 0) : (row.total ?? 0)
    map.set(rid, (map.get(rid) ?? 0) + amt)
  }
  return map
}

export interface RepairRevenueRow {
  id: string
  status?: string | null
  deposit_paid?: number | null
  actual_cost?: number | null
  estimated_cost?: number | null
  refund_amount?: number | null
}

// Per-repair revenue contribution: POS-charged amount if one exists, else
// full job cost for finished jobs, else deposit-paid-minus-refund for
// refunded jobs, else the deposit paid so far for still-open jobs.
export function computeRepairRevenue(repair: RepairRevenueRow, posOverrideMap: Map<string, number>): number {
  const posAmt = posOverrideMap.get(repair.id)
  if (posAmt !== undefined) return posAmt

  const status   = (repair.status ?? '').toLowerCase().trim()
  const deposit  = repair.deposit_paid  ?? 0
  const fullCost = repair.actual_cost   ?? repair.estimated_cost ?? 0
  const refund   = repair.refund_amount ?? 0

  if (status === 'refunded') return Math.max(0, deposit - refund)
  if (isTerminalRepairStatus(status)) return fullCost
  return deposit
}

// Completed-in-period view of "repair revenue" — recognizes a job on the
// date it's actually finished (updated_at), not the date it was booked.
// This is the same rule get_profit_loss uses (migration 152). It's exposed
// as an ADDITIONAL, separate figure alongside the existing booking-window
// revenue/profit (see repairs/stats/route.ts and dashboard.controller.ts) —
// it never replaces them, so no currently-displayed number changes.
export function filterCompletedRepairsInPeriod<T extends { status?: string | null; updated_at?: string | null }>(
  repairs: T[],
  periodStart: string,
  periodEnd?: string
): T[] {
  const start = new Date(periodStart).getTime()
  const end   = periodEnd ? new Date(periodEnd).getTime() : Date.now()
  return repairs.filter((r) => {
    if (!isTerminalRepairStatus(r.status)) return false
    if (!r.updated_at) return false
    const t = new Date(r.updated_at).getTime()
    return t >= start && t <= end
  })
}

export interface RepairPartsCostRow {
  quantity?: number | null
  unit_cost?: number | null
  repairs?: { status?: string | null; deposit_paid?: number | null } | null
}

// FIFO-frozen parts cost (repair_items.quantity * repair_items.unit_cost),
// gated the same way as revenue: counted for finished jobs, counted for open
// jobs once a deposit has been paid, excluded once a job is refunded.
export function computeRepairPartsCost(rows: RepairPartsCostRow[]): number {
  return rows.reduce((sum, item) => {
    const repairStatus = (item.repairs?.status ?? '').toLowerCase().trim()
    const depositPaid  = item.repairs?.deposit_paid ?? 0
    if (repairStatus === 'refunded') return sum
    if (isTerminalRepairStatus(repairStatus)) return sum + (item.quantity ?? 0) * (item.unit_cost ?? 0)
    if (depositPaid > 0) return sum + (item.quantity ?? 0) * (item.unit_cost ?? 0)
    return sum
  }, 0)
}
