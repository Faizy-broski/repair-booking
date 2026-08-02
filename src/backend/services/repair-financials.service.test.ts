import { describe, it, expect } from 'vitest'
import {
  isTerminalRepairStatus,
  buildPosOverrideMap,
  computeRepairRevenue,
  computeRepairPartsCost,
  computeSalesCogs,
  type RepairRevenueRow,
  type RepairPartsCostRow,
  type SalesCogsRow,
} from './repair-financials.service'

describe('isTerminalRepairStatus', () => {
  it('matches exact terminal status names', () => {
    expect(isTerminalRepairStatus('repaired')).toBe(true)
    expect(isTerminalRepairStatus('Collected')).toBe(true)
    expect(isTerminalRepairStatus('  refunded ')).toBe(true)
  })

  it('matches business-defined statuses via keyword fuzzy match', () => {
    expect(isTerminalRepairStatus('Picked up by customer')).toBe(true)
    expect(isTerminalRepairStatus('Job Completed')).toBe(true)
  })

  it('returns false for open/in-progress statuses', () => {
    expect(isTerminalRepairStatus('in_progress')).toBe(false)
    expect(isTerminalRepairStatus('awaiting parts')).toBe(false)
    expect(isTerminalRepairStatus(null)).toBe(false)
    expect(isTerminalRepairStatus(undefined)).toBe(false)
  })
})

describe('buildPosOverrideMap', () => {
  it('sums positive sale totals per repair', () => {
    const map = buildPosOverrideMap([
      { repair_id: 'r1', total: 50, sales: { is_refund: false } },
      { repair_id: 'r1', total: 25, sales: { is_refund: false } },
    ])
    expect(map.get('r1')).toBe(75)
  })

  it('subtracts refund sale totals for the same repair', () => {
    const map = buildPosOverrideMap([
      { repair_id: 'r1', total: 50, sales: { is_refund: false } },
      { repair_id: 'r1', total: 20, sales: { is_refund: true } },
    ])
    expect(map.get('r1')).toBe(30)
  })

  it('ignores rows with no repair_id', () => {
    const map = buildPosOverrideMap([{ repair_id: null, total: 50, sales: { is_refund: false } }])
    expect(map.size).toBe(0)
  })
})

describe('computeRepairRevenue', () => {
  const noOverrides = new Map<string, number>()

  it('prefers the POS-charged amount when one exists, ignoring repair-table columns', () => {
    const overrides = new Map([['r1', 42]])
    const repair: RepairRevenueRow = { id: 'r1', status: 'open', deposit_paid: 999, actual_cost: 999 }
    expect(computeRepairRevenue(repair, overrides)).toBe(42)
  })

  it('uses actual_cost for a terminal-status job with no POS override', () => {
    const repair: RepairRevenueRow = { id: 'r1', status: 'completed', actual_cost: 80, estimated_cost: 100, discount_amount: 10 }
    expect(computeRepairRevenue(repair, noOverrides)).toBe(80)
  })

  it('falls back to estimated_cost minus discount when actual_cost is unset', () => {
    const repair: RepairRevenueRow = { id: 'r1', status: 'completed', actual_cost: null, estimated_cost: 100, discount_amount: 15 }
    expect(computeRepairRevenue(repair, noOverrides)).toBe(85)
  })

  it('never lets the discounted estimated_cost fallback go negative', () => {
    const repair: RepairRevenueRow = { id: 'r1', status: 'completed', actual_cost: null, estimated_cost: 50, discount_amount: 80 }
    expect(computeRepairRevenue(repair, noOverrides)).toBe(0)
  })

  it('uses deposit-minus-refund for a refunded job', () => {
    const repair: RepairRevenueRow = { id: 'r1', status: 'refunded', deposit_paid: 30, refund_amount: 20 }
    expect(computeRepairRevenue(repair, noOverrides)).toBe(10)
  })

  it('floors refunded-job revenue at 0 when refund exceeds deposit', () => {
    const repair: RepairRevenueRow = { id: 'r1', status: 'refunded', deposit_paid: 20, refund_amount: 50 }
    expect(computeRepairRevenue(repair, noOverrides)).toBe(0)
  })

  it('uses the deposit paid so far for an open job', () => {
    const repair: RepairRevenueRow = { id: 'r1', status: 'in_progress', deposit_paid: 25 }
    expect(computeRepairRevenue(repair, noOverrides)).toBe(25)
  })
})

describe('computeSalesCogs', () => {
  it('multiplies quantity by unit_cost for a normal sale line', () => {
    const rows: SalesCogsRow[] = [{ quantity: 3, unit_cost: 10, sales: { is_refund: false } }]
    expect(computeSalesCogs(rows)).toBe(30)
  })

  it('falls back to the product cost_price when unit_cost is not set', () => {
    const rows: SalesCogsRow[] = [{ quantity: 2, unit_cost: null, products: { cost_price: 8 }, sales: { is_refund: false } }]
    expect(computeSalesCogs(rows)).toBe(16)
  })

  it('excludes refund line items instead of double-counting their cost', () => {
    // Regression test: process_refund (migration 010) inserts a refund
    // sale_items row with the ORIGINAL positive quantity and no unit_cost,
    // so it used to fall back to products.cost_price and add a second,
    // spurious COGS charge for every refunded item — understating
    // "Sales Profit" on the dashboard whenever a refund occurred.
    const originalSale: SalesCogsRow = { quantity: 1, unit_cost: 20, sales: { is_refund: false } }
    const refundOfSameItem: SalesCogsRow = { quantity: 1, unit_cost: null, products: { cost_price: 20 }, sales: { is_refund: true } }
    expect(computeSalesCogs([originalSale, refundOfSameItem])).toBe(20)
  })

  it('sums across multiple items', () => {
    const rows: SalesCogsRow[] = [
      { quantity: 2, unit_cost: 5, sales: { is_refund: false } },
      { quantity: 1, unit_cost: 12, sales: { is_refund: false } },
    ]
    expect(computeSalesCogs(rows)).toBe(22)
  })

  it('treats a missing sales relation as a non-refund row', () => {
    const rows: SalesCogsRow[] = [{ quantity: 1, unit_cost: 9 }]
    expect(computeSalesCogs(rows)).toBe(9)
  })
})

describe('computeRepairPartsCost', () => {
  it('counts parts cost for a terminal-status repair', () => {
    const rows: RepairPartsCostRow[] = [
      { quantity: 2, unit_cost: 10, repairs: { status: 'completed', deposit_paid: 0 } },
    ]
    expect(computeRepairPartsCost(rows)).toBe(20)
  })

  it('counts parts cost for an open repair once a deposit has been paid', () => {
    const rows: RepairPartsCostRow[] = [
      { quantity: 1, unit_cost: 15, repairs: { status: 'in_progress', deposit_paid: 50 } },
    ]
    expect(computeRepairPartsCost(rows)).toBe(15)
  })

  it('excludes parts cost for an open repair with no deposit paid', () => {
    const rows: RepairPartsCostRow[] = [
      { quantity: 1, unit_cost: 15, repairs: { status: 'in_progress', deposit_paid: 0 } },
    ]
    expect(computeRepairPartsCost(rows)).toBe(0)
  })

  it('excludes parts cost entirely for a refunded repair', () => {
    const rows: RepairPartsCostRow[] = [
      { quantity: 3, unit_cost: 10, repairs: { status: 'refunded', deposit_paid: 100 } },
    ]
    expect(computeRepairPartsCost(rows)).toBe(0)
  })

  it('sums across multiple line items', () => {
    const rows: RepairPartsCostRow[] = [
      { quantity: 1, unit_cost: 10, repairs: { status: 'completed', deposit_paid: 0 } },
      { quantity: 2, unit_cost: 5, repairs: { status: 'completed', deposit_paid: 0 } },
    ]
    expect(computeRepairPartsCost(rows)).toBe(20)
  })
})
