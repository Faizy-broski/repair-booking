import { describe, it, expect } from 'vitest'
import {
  computeCashNet,
  computeDashboardFinancials,
  computeRepairJobCounts,
  computeTenderBreakdown,
  type DashboardFinancialsInput,
} from './dashboard-stats.service'

function baseInput(overrides: Partial<DashboardFinancialsInput> = {}): DashboardFinancialsInput {
  return {
    saleTotals: [],
    expenseAmounts: [],
    cashMovements: [],
    repairsRevenueRows: [],
    posRepairOverrideRows: [],
    salesCogsRows: [],
    repairsPartsRows: [],
    ...overrides,
  }
}

describe('computeCashNet', () => {
  it('adds cash_in and subtracts cash_out', () => {
    expect(computeCashNet([
      { type: 'cash_in', amount: 50 },
      { type: 'cash_out', amount: 20, purpose: 'plain' },
    ])).toBe(30)
  })

  it('does not subtract cash_out rows with purpose "expense" (already counted in total_expenses)', () => {
    expect(computeCashNet([
      { type: 'cash_out', amount: 40, purpose: 'expense' },
    ])).toBe(0)
  })
})

describe('computeDashboardFinancials — Use case: a normal trading day', () => {
  it('a branch with $500 in product sales, $50 COGS, one finished $100 repair with $30 in parts, and $80 expenses', () => {
    const stats = computeDashboardFinancials(baseInput({
      saleTotals: [{ total: 500 }],
      salesCogsRows: [{ quantity: 5, unit_cost: 10, sales: { is_refund: false } }], // 50
      expenseAmounts: [{ amount: 80 }],
      repairsRevenueRows: [{ id: 'r1', status: 'completed', actual_cost: 100 }],
      repairsPartsRows: [{ quantity: 1, unit_cost: 30, repairs: { status: 'completed', deposit_paid: 0 } }],
    }))

    expect(stats.total_sales).toBe(500)
    expect(stats.repairs_revenue).toBe(100)
    expect(stats.total_expenses).toBe(80)
    expect(stats.sales_profit).toBe(450)      // 500 - 50
    expect(stats.repairs_profit).toBe(70)     // 100 - 30
    expect(stats.net_profit).toBe(520)        // 500 + 100 - 80
  })
})

describe('computeDashboardFinancials — Use case: refund lowers revenue but must not double-charge COGS', () => {
  it('a $100 sale later fully refunded nets to zero sales_profit, not negative', () => {
    // The refund's sale_items row is excluded from salesCogsRows entirely by
    // the caller's query (`.eq('sales.is_refund', false)`), matching how
    // computeSalesCogs is meant to be fed.
    const stats = computeDashboardFinancials(baseInput({
      saleTotals: [{ total: 100 }, { total: -100 }], // sale + its refund
      salesCogsRows: [{ quantity: 1, unit_cost: 40, sales: { is_refund: false } }], // original sale only
    }))

    expect(stats.total_sales).toBe(0)
    expect(stats.sales_profit).toBe(-40) // COGS was already spent buying the stock; refunding the sale doesn't refund the wholesale cost
  })

  it('regression: a refund line item accidentally included in salesCogsRows must not be double-charged', () => {
    // If the caller forgot to filter is_refund at the query level,
    // computeSalesCogs still defends against it (see repair-financials.service.test.ts).
    const stats = computeDashboardFinancials(baseInput({
      saleTotals: [{ total: 100 }, { total: -100 }],
      salesCogsRows: [
        { quantity: 1, unit_cost: 40, sales: { is_refund: false } },
        { quantity: 1, unit_cost: null, products: { cost_price: 40 }, sales: { is_refund: true } },
      ],
    }))
    expect(stats.sales_profit).toBe(-40) // not -80
  })
})

describe('computeDashboardFinancials — Use case: repair paid through the POS till', () => {
  it('shows the POS-charged amount on the Repairs Revenue card, but does not double-count it into Net Profit', () => {
    // Regression test: the repair's $120 payment was rung up as a normal
    // sale (sale_items), so it's already inside total_sales via the
    // `sales` table. posRepairOverrideRows makes the "Repairs Revenue" card
    // reflect the real $120 collected (informational — replaces the stale
    // deposit_paid=$20 the repairs table still holds), but net_profit must
    // treat that $120 as already counted once (in total_sales) rather than
    // adding it again — otherwise every till-paid repair inflates Net
    // Profit by its own amount.
    const stats = computeDashboardFinancials(baseInput({
      saleTotals: [{ total: 120 }],
      repairsRevenueRows: [{ id: 'r1', status: 'in_progress', deposit_paid: 20 }],
      posRepairOverrideRows: [{ repair_id: 'r1', total: 120, sales: { is_refund: false } }],
    }))
    expect(stats.total_sales).toBe(120)
    expect(stats.repairs_revenue).toBe(120)   // card: real amount collected for the repair
    expect(stats.net_profit).toBe(120)        // not 240 — the $120 is only counted once
  })

  it('a repair NOT paid through the POS till (deposit taken in the Repairs module) is fully additive to Net Profit', () => {
    const stats = computeDashboardFinancials(baseInput({
      saleTotals: [{ total: 200 }],
      repairsRevenueRows: [{ id: 'r2', status: 'in_progress', deposit_paid: 50 }],
      posRepairOverrideRows: [], // no POS sale for this repair
    }))
    expect(stats.total_sales).toBe(200)
    expect(stats.repairs_revenue).toBe(50)
    expect(stats.net_profit).toBe(250) // 200 (sales) + 50 (repair deposit, collected outside the till)
  })

  it('mixed period: one repair paid via POS, one paid via a repairs-module deposit', () => {
    const stats = computeDashboardFinancials(baseInput({
      saleTotals: [{ total: 120 }], // the till-paid repair's sale
      repairsRevenueRows: [
        { id: 'r1', status: 'in_progress', deposit_paid: 20 }, // paid via POS — posOverride wins
        { id: 'r2', status: 'in_progress', deposit_paid: 50 }, // paid via Repairs module directly
      ],
      posRepairOverrideRows: [{ repair_id: 'r1', total: 120, sales: { is_refund: false } }],
    }))
    expect(stats.repairs_revenue).toBe(170)   // 120 (r1, POS) + 50 (r2, deposit) — full informational figure
    expect(stats.net_profit).toBe(170)        // 120 (sales, includes r1) + 50 (r2 only, r1 excluded to avoid double count)
  })
})

describe('computeDashboardFinancials — Use case: cash drawer adjustments', () => {
  it('a manual cash-in (float top-up) increases total_sales and net_profit', () => {
    const stats = computeDashboardFinancials(baseInput({
      saleTotals: [{ total: 200 }],
      cashMovements: [{ type: 'cash_in', amount: 50, purpose: 'plain' }],
    }))
    expect(stats.total_sales).toBe(250)
    expect(stats.net_profit).toBe(250)
  })

  it('a buyback cash-out reduces total_sales', () => {
    const stats = computeDashboardFinancials(baseInput({
      saleTotals: [{ total: 200 }],
      cashMovements: [{ type: 'cash_out', amount: 30, purpose: 'buyback' }],
    }))
    expect(stats.total_sales).toBe(170)
  })

  it('an expense-purpose cash-out is excluded from total_sales (it is already in total_expenses)', () => {
    const stats = computeDashboardFinancials(baseInput({
      saleTotals: [{ total: 200 }],
      cashMovements: [{ type: 'cash_out', amount: 30, purpose: 'expense' }],
      expenseAmounts: [{ amount: 30 }],
    }))
    expect(stats.total_sales).toBe(200)
    expect(stats.total_expenses).toBe(30)
    expect(stats.net_profit).toBe(170)
  })
})

describe('computeDashboardFinancials — Use case: an empty period (new branch, no activity)', () => {
  it('every KPI is zero, none are NaN', () => {
    const stats = computeDashboardFinancials(baseInput())
    expect(stats).toEqual({
      total_sales: 0, total_expenses: 0, repairs_revenue: 0,
      net_profit: 0, sales_profit: 0, repairs_profit: 0,
    })
  })
})

describe('computeRepairJobCounts', () => {
  const cutoff = '2026-07-30T00:00:00.000Z' // "3 days ago" relative to a fixed "today" for the test

  it('counts non-terminal jobs as open', () => {
    const { repairs_open } = computeRepairJobCounts([
      { status: 'in_progress', created_at: '2026-08-01T00:00:00.000Z' },
      { status: 'completed', created_at: '2026-08-01T00:00:00.000Z' },
    ], cutoff)
    expect(repairs_open).toBe(1)
  })

  it('flags a rush job as urgent even if just created', () => {
    const { repairs_urgent } = computeRepairJobCounts([
      { status: 'in_progress', created_at: '2026-08-02T00:00:00.000Z', is_rush: true },
    ], cutoff)
    expect(repairs_urgent).toBe(1)
  })

  it('flags a non-rush job as urgent once it has aged past the cutoff', () => {
    const { repairs_urgent } = computeRepairJobCounts([
      { status: 'in_progress', created_at: '2026-07-20T00:00:00.000Z', is_rush: false },
    ], cutoff)
    expect(repairs_urgent).toBe(1)
  })

  it('does not flag a fresh, non-rush job as urgent', () => {
    const { repairs_urgent } = computeRepairJobCounts([
      { status: 'in_progress', created_at: '2026-08-01T00:00:00.000Z', is_rush: false },
    ], cutoff)
    expect(repairs_urgent).toBe(0)
  })

  it('never counts a terminal-status job as urgent, even if rushed and old', () => {
    const { repairs_urgent } = computeRepairJobCounts([
      { status: 'completed', created_at: '2026-01-01T00:00:00.000Z', is_rush: true },
    ], cutoff)
    expect(repairs_urgent).toBe(0)
  })
})

describe('computeTenderBreakdown — Use case: end-of-day cash vs card revenue', () => {
  it('splits cash and card sales into separate totals', () => {
    const { cash, card } = computeTenderBreakdown([
      { payment_method: 'cash', total: 40 },
      { payment_method: 'card', total: 60 },
    ])
    expect(cash).toBe(40)
    expect(card).toBe(60)
  })

  it('a split-tender sale contributes its cash portion and card portion separately', () => {
    const { cash, card } = computeTenderBreakdown([
      { payment_method: 'split', total: 100, payment_splits: [{ method: 'cash', amount: 25 }, { method: 'card', amount: 75 }] },
    ])
    expect(cash).toBe(25)
    expect(card).toBe(75)
  })

  it('a same-day cash refund (negative total) nets back out of today\'s cash revenue', () => {
    const { cash } = computeTenderBreakdown([
      { payment_method: 'cash', total: 100 },
      { payment_method: 'cash', total: -100 },
    ])
    expect(cash).toBe(0)
  })

  it('ignores tender types that are neither cash nor card (e.g. gift_card, on_account)', () => {
    const { cash, card } = computeTenderBreakdown([
      { payment_method: 'gift_card', total: 50 },
      { payment_method: 'on_account', total: 75 },
    ])
    expect(cash).toBe(0)
    expect(card).toBe(0)
  })
})
