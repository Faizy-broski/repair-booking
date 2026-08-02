import { describe, it, expect } from 'vitest'
import { computeSalesStats, type SalesStatsSaleRow, type SalesStatsCashRow } from './pos.service'

function saleRow(overrides: Partial<SalesStatsSaleRow> = {}): SalesStatsSaleRow {
  return {
    total: 100,
    is_refund: false,
    payment_method: 'cash',
    payment_splits: null,
    ...overrides,
  }
}

describe('computeSalesStats', () => {
  it('sums non-refund sale totals as revenue', () => {
    const rows = [saleRow({ total: 50 }), saleRow({ total: 30 })]
    const stats = computeSalesStats(rows, [])
    expect(stats.sales_count).toBe(2)
    expect(stats.revenue).toBe(80)
  })

  it('excludes refund rows from sales_count/revenue', () => {
    const rows = [
      saleRow({ total: 100 }),
      saleRow({ total: -40, is_refund: true }),
    ]
    const stats = computeSalesStats(rows, [])
    expect(stats.sales_count).toBe(1)
    expect(stats.revenue).toBe(100)
    expect(stats.refund_count).toBe(1)
  })

  it('reports refund_amount as a positive magnitude even though refund totals are stored negative', () => {
    // process_refund (migration 010) inserts refund sale rows with a
    // negative `total`. refund_amount must still come out positive so it's
    // consistent with RepairService.getRevenueStats().refundAmount, which
    // getSalesStats adds on top of this.
    const rows = [saleRow({ total: -75, is_refund: true })]
    const stats = computeSalesStats(rows, [])
    expect(stats.refund_amount).toBe(75)
  })

  it('sums multiple refunds to a positive total', () => {
    const rows = [
      saleRow({ total: -20, is_refund: true }),
      saleRow({ total: -30, is_refund: true }),
    ]
    const stats = computeSalesStats(rows, [])
    expect(stats.refund_amount).toBe(50)
  })

  it('buckets cash and card totals by payment_method, excluding refunds', () => {
    const rows = [
      saleRow({ total: 40, payment_method: 'cash' }),
      saleRow({ total: 60, payment_method: 'card' }),
      saleRow({ total: -10, payment_method: 'cash', is_refund: true }),
    ]
    const stats = computeSalesStats(rows, [])
    expect(stats.cash_total).toBe(40)
    expect(stats.card_total).toBe(60)
  })

  it('splits a split-payment sale across cash and card totals', () => {
    const rows = [
      saleRow({
        total: 100,
        payment_method: 'split',
        payment_splits: [
          { method: 'cash', amount: 30 },
          { method: 'card', amount: 70 },
        ],
      }),
    ]
    const stats = computeSalesStats(rows, [])
    expect(stats.cash_total).toBe(30)
    expect(stats.card_total).toBe(70)
  })

  it('folds cash_in into revenue and cash_out out of revenue', () => {
    const rows = [saleRow({ total: 100 })]
    const cashRows: SalesStatsCashRow[] = [
      { type: 'cash_in', amount: 20 },
      { type: 'cash_out', amount: 15 },
    ]
    const stats = computeSalesStats(rows, cashRows)
    expect(stats.cash_in_total).toBe(20)
    expect(stats.cash_out_total).toBe(15)
    expect(stats.revenue).toBe(100 + 20 - 15)
  })

  it('handles an empty period with no rows', () => {
    const stats = computeSalesStats([], [])
    expect(stats).toMatchObject({
      sales_count: 0, revenue: 0, refund_count: 0, refund_amount: 0,
      cash_total: 0, card_total: 0, cash_in_total: 0, cash_out_total: 0,
    })
  })
})
