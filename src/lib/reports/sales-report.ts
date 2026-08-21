// Pure daily-grouping logic behind the Sales Report page (Total Revenue /
// Transactions / Avg. Order KPI row + the daily table). Split out of
// reports/sales/page.tsx so it's unit testable without React/react-query.

export interface SalesReportSaleRow {
  total: number | null
  created_at: string | null
  is_refund?: boolean | null
}

export interface SalesReportCashRow {
  type: 'cash_in' | 'cash_out'
  amount: number | null
  created_at: string | null
}

export interface DailySalesRow {
  date: string
  total_sales: number
  transaction_count: number
  avg_order_value: number
}

export function groupDailySales(sales: SalesReportSaleRow[], cashMovements: SalesReportCashRow[]): DailySalesRow[] {
  const grouped: Record<string, { total: number; count: number }> = {}

  for (const s of sales) {
    const d = s.created_at?.split('T')[0] ?? ''
    if (!grouped[d]) grouped[d] = { total: 0, count: 0 }
    // Refund rows store a POSITIVE total with is_refund=true as the flag
    // (see process_refund, migration 188) — sign by is_refund to net them
    // out of revenue, rather than assuming the old negative-total convention.
    grouped[d].total += s.is_refund ? -(s.total ?? 0) : (s.total ?? 0)
    // A refund isn't a distinct "order" — counting it here would understate
    // Avg. Order Value (a $100 sale + its full refund would average to $0
    // across "2 transactions" instead of $100 across 1).
    if (!s.is_refund) grouped[d].count += 1
  }

  // Cash In adds to Sales revenue, Cash Out subtracts — folded into the same
  // daily buckets (no transaction-count change, revenue-only).
  for (const m of cashMovements) {
    const d = m.created_at?.split('T')[0] ?? ''
    if (!grouped[d]) grouped[d] = { total: 0, count: 0 }
    grouped[d].total += m.type === 'cash_in' ? (m.amount ?? 0) : -(m.amount ?? 0)
  }

  return Object.entries(grouped).map(([date, { total, count }]) => ({
    date,
    total_sales: total,
    transaction_count: count,
    avg_order_value: count ? total / count : 0,
  }))
}
