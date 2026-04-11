'use client'
import { useState, useEffect, useCallback } from 'react'
import { Download, ArrowLeft, AlertTriangle, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'

type SubTab = 'summary' | 'low_stock' | 'parts_consumption' | 'adjustments'

interface InventorySummaryRow { product_id: string; product_name: string; sku: string | null; category: string; quantity: number; cost_price: number; stock_value: number; retail_value: number }
interface PartConsumptionRow  { product_id: string; product_name: string; sku: string | null; quantity: number; total_cost: number }
interface AdjustmentRow       { id: string; product_id: string; quantity_change: number; reason: string | null; reference_type: string | null; created_at: string; products: { name: string; sku: string | null } | null }
interface LowStockRow         { id: string; product_id: string; quantity: number; low_stock_alert: number; products?: { id: string; name: string; sku: string | null } | null }
interface InventoryOverview   { low_stock_count: number; low_stock_items: LowStockRow[]; total_items: number; total_value: number }

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }
function exportCsv<T extends Record<string, unknown>>(rows: T[], filename: string) {
  if (!rows.length) return
  const h = Object.keys(rows[0])
  const csv = [h.join(','), ...rows.map((r) => h.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = filename; a.click()
}

export default function InventoryReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [subTab, setSubTab] = useState<SubTab>('summary')
  const [overview, setOverview] = useState<InventoryOverview | null>(null)
  const [summaryData, setSummaryData] = useState<InventorySummaryRow[]>([])
  const [partData, setPartData] = useState<PartConsumptionRow[]>([])
  const [adjData, setAdjData] = useState<AdjustmentRow[]>([])

  const fetchOverview = useCallback(async () => {
    if (!activeBranch) return
    const params = new URLSearchParams({ type: 'inventory', branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
    const res = await fetch(`/api/reports?${params}`)
    const json = await res.json()
    setOverview(json.data ?? null)
  }, [activeBranch, dateFrom, dateTo])

  const fetchDetail = useCallback(async (st: SubTab) => {
    if (!activeBranch || st === 'low_stock') return
    setLoading(true)
    try {
      const params = new URLSearchParams({ branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59`, subtype: st })
      const res = await fetch(`/api/reports/inventory-detail?${params}`)
      const json = await res.json()
      if (st === 'summary')           setSummaryData(json.data ?? [])
      if (st === 'parts_consumption') setPartData(json.data ?? [])
      if (st === 'adjustments')       setAdjData(json.data ?? [])
    } finally { setLoading(false) }
  }, [activeBranch, dateFrom, dateTo])

  const handleApply = useCallback(() => {
    fetchOverview()
    fetchDetail(subTab)
  }, [fetchOverview, fetchDetail, subTab])

  useEffect(() => { fetchOverview(); fetchDetail('summary') }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchDetail(subTab) }, [subTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const summaryColumns: ColumnDef<InventorySummaryRow>[] = [
    { accessorKey: 'product_name', header: 'Product' },
    { accessorKey: 'sku',          header: 'SKU',         cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'category',     header: 'Category' },
    { accessorKey: 'quantity',     header: 'Qty' },
    { accessorKey: 'stock_value',  header: 'Stock Value',  cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'retail_value', header: 'Retail Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const partColumns: ColumnDef<PartConsumptionRow>[] = [
    { accessorKey: 'product_name', header: 'Part' },
    { accessorKey: 'sku',          header: 'SKU',        cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'quantity',     header: 'Qty Used' },
    { accessorKey: 'total_cost',   header: 'Total Cost', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const adjColumns: ColumnDef<AdjustmentRow>[] = [
    { accessorKey: 'created_at',    header: 'Date',    cell: ({ getValue }) => formatDate(getValue() as string) },
    { id: 'product', header: 'Product', cell: ({ row }) => row.original.products?.name ?? row.original.product_id },
    { accessorKey: 'quantity_change', header: 'Change', cell: ({ getValue }) => {
      const v = getValue() as number
      return <span className={v > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{v > 0 ? `+${v}` : v}</span>
    }},
    { accessorKey: 'reason',         header: 'Reason', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'reference_type', header: 'Type',   cell: ({ getValue }) => (getValue() as string) ?? '—' },
  ]

  const exportCurrentTab = () => {
    if (subTab === 'summary')           exportCsv(summaryData as unknown as Record<string, unknown>[], `inventory-summary-${dateFrom}-${dateTo}.csv`)
    if (subTab === 'parts_consumption') exportCsv(partData    as unknown as Record<string, unknown>[], `parts-usage-${dateFrom}-${dateTo}.csv`)
    if (subTab === 'adjustments')       exportCsv(adjData     as unknown as Record<string, unknown>[], `adjustments-${dateFrom}-${dateTo}.csv`)
    if (subTab === 'low_stock' && overview) exportCsv(overview.low_stock_items as unknown as Record<string, unknown>[], `low-stock-${dateFrom}-${dateTo}.csv`)
  }

  const SUB_TABS: { value: SubTab; label: string }[] = [
    { value: 'summary',           label: 'Summary'     },
    { value: 'low_stock',         label: 'Low Stock'   },
    { value: 'parts_consumption', label: 'Part Usage'  },
    { value: 'adjustments',       label: 'Adjustments' },
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-on-surface">Inventory Report</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Stock levels, valuation and adjustments</p>
          </div>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={exportCurrentTab}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={handleApply} />

      {/* Overview KPIs */}
      {overview && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-outline-variant bg-surface p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <p className="text-sm text-on-surface-variant">Low Stock</p>
            </div>
            <p className="text-2xl font-bold text-orange-600 sm:text-3xl">{overview.low_stock_count}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-on-surface-variant" />
              <p className="text-sm text-on-surface-variant">Total Units</p>
            </div>
            <p className="text-2xl font-bold text-on-surface sm:text-3xl">{overview.total_items}</p>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface p-4">
            <p className="text-sm text-on-surface-variant">Stock Value</p>
            <p className="mt-1 text-2xl font-bold text-green-600 sm:text-3xl">{formatCurrency(overview.total_value)}</p>
          </div>
        </div>
      )}

      {/* Sub tabs */}
      <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl w-fit">
        {SUB_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setSubTab(t.value)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              subTab === t.value
                ? 'bg-brand-teal text-on-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            )}
          >
            {t.label}
            {t.value === 'low_stock' && overview && overview.low_stock_count > 0 && (
              <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] text-white font-semibold">
                {overview.low_stock_count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Summary */}
      {subTab === 'summary' && (
        <DataTable data={summaryData} columns={summaryColumns} isLoading={loading} emptyMessage="No inventory data." />
      )}

      {/* Low stock */}
      {subTab === 'low_stock' && overview && (
        <div className="rounded-xl border border-outline-variant bg-surface overflow-hidden">
          <div className="flex items-center gap-2 border-b border-outline-variant px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <h3 className="font-semibold text-on-surface text-base">Low Stock Items ({overview.low_stock_count})</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-xs text-on-surface-variant">
              <tr>
                <th className="px-4 py-2 text-left">Product</th>
                <th className="px-4 py-2 text-right">On Hand</th>
                <th className="px-4 py-2 text-right">Alert</th>
                <th className="px-4 py-2 text-right">Shortfall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {overview.low_stock_items.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-on-surface-variant">No low stock items.</td></tr>
              )}
              {overview.low_stock_items.map((item) => (
                <tr key={item.id} className="hover:bg-surface-container-low">
                  <td className="px-4 py-3">
                    <p className="font-medium text-on-surface">{item.products?.name}</p>
                    {item.products?.sku && <p className="text-xs text-on-surface-variant">SKU: {item.products.sku}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={item.quantity === 0 ? 'destructive' : 'warning'}>{item.quantity}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-on-surface-variant">{item.low_stock_alert ?? 5}</td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">
                    {Math.max(0, (item.low_stock_alert ?? 5) - item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Part usage */}
      {subTab === 'parts_consumption' && (
        <DataTable data={partData} columns={partColumns} isLoading={loading} emptyMessage="No part consumption data for this period." />
      )}

      {/* Adjustments */}
      {subTab === 'adjustments' && (
        <DataTable data={adjData} columns={adjColumns} isLoading={loading} emptyMessage="No inventory adjustments for this period." />
      )}
    </div>
  )
}
