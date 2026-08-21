import { describe, it, expect } from 'vitest'
import { groupDailySales } from './sales-report'

describe('groupDailySales — Use case: Sales Report Avg. Order Value KPI', () => {
  it('a single day, single sale: avg order equals the sale total', () => {
    const rows = groupDailySales([{ total: 80, created_at: '2026-08-01T10:00:00Z' }], [])
    expect(rows).toEqual([{ date: '2026-08-01', total_sales: 80, transaction_count: 1, avg_order_value: 80 }])
  })

  it('two sales on the same day average correctly', () => {
    const rows = groupDailySales([
      { total: 100, created_at: '2026-08-01T09:00:00Z' },
      { total: 60,  created_at: '2026-08-01T15:00:00Z' },
    ], [])
    expect(rows[0].transaction_count).toBe(2)
    expect(rows[0].total_sales).toBe(160)
    expect(rows[0].avg_order_value).toBe(80)
  })

  it('regression: a sale fully refunded the same day nets revenue to 0 without dragging Avg. Order to 0', () => {
    // Previously the refund row was counted as its own "transaction," so a
    // $100 sale + its refund averaged to $0 across "2 transactions" instead
    // of reporting the $100 sale that actually happened. Refund rows store a
    // POSITIVE total with is_refund=true as the flag (migration 188) — not a
    // negative total — so groupDailySales must sign by is_refund itself.
    const rows = groupDailySales([
      { total: 100, created_at: '2026-08-01T09:00:00Z', is_refund: false },
      { total: 100, created_at: '2026-08-01T16:00:00Z', is_refund: true },
    ], [])
    expect(rows[0].total_sales).toBe(0)          // revenue still nets to zero
    expect(rows[0].transaction_count).toBe(1)    // but only 1 real sale happened
    expect(rows[0].avg_order_value).toBe(0)      // 0 / 1, not 0 / 2 — same result here, but see next test
  })

  it('regression: a partial-day refund no longer drags Avg. Order toward zero', () => {
    const rows = groupDailySales([
      { total: 100, created_at: '2026-08-01T09:00:00Z', is_refund: false },
      { total: 50,  created_at: '2026-08-01T11:00:00Z', is_refund: false },
      { total: 20,  created_at: '2026-08-01T16:00:00Z', is_refund: true }, // partial refund on an earlier sale
    ], [])
    expect(rows[0].total_sales).toBe(130)         // 100 + 50 - 20
    expect(rows[0].transaction_count).toBe(2)     // 2 real sales, refund excluded
    expect(rows[0].avg_order_value).toBe(65)      // 130 / 2, not 130 / 3
  })

  it('regression (migration 188): a refund with a POSITIVE total nets out correctly, not doubled', () => {
    // Before this fix, groupDailySales() summed raw totals and relied on the
    // caller sending refunds as negative — since migration 188, refunds are
    // always positive with is_refund=true, so a naive sum would have shown
    // 220 (100 + 100 + 20) here instead of the correct net 180.
    const rows = groupDailySales([
      { total: 100, created_at: '2026-08-01T09:00:00Z', is_refund: false },
      { total: 100, created_at: '2026-08-01T11:00:00Z', is_refund: false },
      { total: 20,  created_at: '2026-08-01T16:00:00Z', is_refund: true },
    ], [])
    expect(rows[0].total_sales).toBe(180)
  })

  it('buckets rows by calendar day', () => {
    const rows = groupDailySales([
      { total: 10, created_at: '2026-08-01T09:00:00Z' },
      { total: 20, created_at: '2026-08-02T09:00:00Z' },
    ], [])
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.date === '2026-08-01')?.total_sales).toBe(10)
    expect(rows.find(r => r.date === '2026-08-02')?.total_sales).toBe(20)
  })

  it('folds cash_in/cash_out into the day\'s revenue without touching transaction_count', () => {
    const rows = groupDailySales(
      [{ total: 100, created_at: '2026-08-01T09:00:00Z' }],
      [
        { type: 'cash_in', amount: 20, created_at: '2026-08-01T10:00:00Z' },
        { type: 'cash_out', amount: 5, created_at: '2026-08-01T11:00:00Z' },
      ]
    )
    expect(rows[0].total_sales).toBe(115) // 100 + 20 - 5
    expect(rows[0].transaction_count).toBe(1)
  })

  it('a day with cash movements but no sales still produces a row with 0 transactions and no NaN average', () => {
    const rows = groupDailySales([], [{ type: 'cash_in', amount: 50, created_at: '2026-08-01T09:00:00Z' }])
    expect(rows[0].transaction_count).toBe(0)
    expect(rows[0].avg_order_value).toBe(0)
  })

  it('an empty period returns no rows', () => {
    expect(groupDailySales([], [])).toEqual([])
  })
})
