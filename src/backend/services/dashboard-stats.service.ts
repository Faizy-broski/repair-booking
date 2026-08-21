// Pure aggregation logic behind the tenant Dashboard's KPI cards
// (total_sales, net_profit, sales_profit, repairs_profit, repairs_open,
// repairs_urgent, today_cash_revenue, today_card_revenue). Split out of
// dashboard.controller.ts — which has two near-identical handlers
// (getMain/get) — so the math is defined once, shared, and unit testable
// without a DB.
import {
  isTerminalRepairStatus,
  buildPosOverrideMap,
  computeRepairRevenue,
  computeRepairPartsCost,
  computeRepairLabFeeCost,
  computeSalesCogs,
  type PosOverrideRow,
  type RepairRevenueRow,
  type RepairPartsCostRow,
  type SalesCogsRow,
} from './repair-financials.service'

export interface CashMovementRow {
  type: string
  amount: number | null
  purpose?: string | null
}

// Cash In adds to Sales revenue, Cash Out subtracts — except 'expense'
// purpose cash-outs (already counted via total_expenses) and
// 'gift_card_sale' purpose cash-ins (deferred revenue, not revenue — a gift
// card sale is a liability until redeemed, same reason store_credit/
// loyalty_points sales are excluded from the register's cash_sales; see
// migration 187).
export function computeCashNet(rows: CashMovementRow[]): number {
  return rows.reduce(
    (s, r) => s + (
      r.type === 'cash_in'
        ? (r.purpose === 'gift_card_sale' ? 0 : (r.amount ?? 0))
        : (r.purpose === 'expense' ? 0 : -(r.amount ?? 0))
    ),
    0
  )
}

export interface DashboardFinancialsInput {
  saleTotals: { total: number | null; is_refund?: boolean | null }[]
  expenseAmounts: { amount: number | null }[]
  cashMovements: CashMovementRow[]
  repairsRevenueRows: RepairRevenueRow[]
  posRepairOverrideRows: PosOverrideRow[]
  salesCogsRows: SalesCogsRow[]
  repairsPartsRows: RepairPartsCostRow[]
}

export interface DashboardFinancials {
  total_sales: number
  total_expenses: number
  repairs_revenue: number
  net_profit: number
  sales_profit: number
  repairs_profit: number
}

export function computeDashboardFinancials(input: DashboardFinancialsInput): DashboardFinancials {
  const cashNet = computeCashNet(input.cashMovements)
  // Cash In/Out is baked directly into total_sales so every consumer of this
  // stat (the "Sales Revenue" card, net_profit, sales_profit) reflects it
  // automatically. Refund rows store a POSITIVE total with is_refund=true as
  // the flag (migration 188) — sign by is_refund to net them out of revenue,
  // rather than assuming the old negative-total convention.
  const totalSales = input.saleTotals.reduce((s, r) => s + (r.is_refund ? -(r.total ?? 0) : (r.total ?? 0)), 0) + cashNet
  const totalExpenses = input.expenseAmounts.reduce((s, r) => s + (r.amount ?? 0), 0)

  const posRepairAmounts = buildPosOverrideMap(input.posRepairOverrideRows)
  const repairsRevenue = input.repairsRevenueRows.reduce(
    (s, r) => s + computeRepairRevenue(r, posRepairAmounts),
    0
  )

  // net_profit adds "all revenue" (Sales Revenue card + Repairs Revenue
  // card) minus expenses. But a repair paid off through the POS till is a
  // `sales` row too — it's already inside totalSales via posRepairAmounts'
  // POS-override rule (see computeRepairRevenue). Adding the full
  // repairsRevenue on top would double-count that portion. Only the part of
  // repairsRevenue NOT backed by a POS sale (deposits/final payments taken
  // outside the till) is incremental to totalSales — mirrors the same
  // skip RepairService.getRevenueStats() uses for the Sales page total.
  const repairsRevenueNotInPos = input.repairsRevenueRows.reduce((s, r) => {
    if (posRepairAmounts.has(r.id)) return s
    return s + computeRepairRevenue(r, posRepairAmounts)
  }, 0)

  const salesCogs = computeSalesCogs(input.salesCogsRows)
  const repairsPartsCost = computeRepairPartsCost(input.repairsPartsRows)
  // Same rows as repairsRevenueRows above — lab_fee lives directly on the
  // repairs row, no extra join/query needed.
  const repairsLabFeeCost = computeRepairLabFeeCost(input.repairsRevenueRows)

  return {
    total_sales: totalSales,
    total_expenses: totalExpenses,
    repairs_revenue: repairsRevenue,
    // net_profit stays revenue-minus-expenses (matches its pre-existing
    // definition, which already excludes repairsPartsCost too) — only the
    // COGS-adjusted repairs_profit card is affected by lab fee, same as parts cost.
    net_profit: totalSales + repairsRevenueNotInPos - totalExpenses,
    sales_profit: totalSales - salesCogs,
    repairs_profit: repairsRevenue - repairsPartsCost - repairsLabFeeCost,
  }
}

export interface RepairStatusRow {
  status: string | null
  created_at: string
  is_rush?: boolean | null
}

// Open/Urgent job counts — always all-time current state, never filtered by
// period. A job is "urgent" once it's rushed or has sat open for longer than
// the urgent cutoff.
export function computeRepairJobCounts(rows: RepairStatusRow[], urgentCutoffIso: string) {
  const openJobs = rows.filter((r) => !isTerminalRepairStatus(r.status))
  const cutoff = new Date(urgentCutoffIso)
  const urgentJobs = openJobs.filter((r) => r.is_rush === true || new Date(r.created_at) < cutoff)
  return { repairs_open: openJobs.length, repairs_urgent: urgentJobs.length }
}

export interface TenderSaleRow {
  payment_method: string
  total: number | null
  payment_splits?: { method: string; amount: number }[] | null
  is_refund?: boolean | null
}

// Cash/card breakdown for "Today's Cash Revenue" / "Today's Card Revenue".
// Not refund-filtered by the caller's query — instead explicitly signed here
// via is_refund, so a same-day refund nets itself out of today's tender
// total. (Previously relied on a refund row's `total` being stored negative,
// per the old process_refund() convention — migration 188 changed refund
// rows to always store a POSITIVE total with is_refund=true as the flag, so
// this now negates explicitly instead of trusting the raw sign.)
export function computeTenderBreakdown(rows: TenderSaleRow[]): { cash: number; card: number } {
  let cash = 0
  let card = 0
  for (const sale of rows) {
    const sign = sale.is_refund ? -1 : 1
    const total = sale.total ?? 0
    if (sale.payment_method === 'split' && sale.payment_splits?.length) {
      for (const s of sale.payment_splits) {
        if (s.method === 'cash') cash += sign * s.amount
        else if (s.method === 'card') card += sign * s.amount
      }
    } else if (sale.payment_method === 'cash') {
      cash += sign * total
    } else if (sale.payment_method === 'card') {
      card += sign * total
    }
  }
  return { cash, card }
}
