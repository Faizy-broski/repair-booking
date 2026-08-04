'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, ArrowLeft, AlertTriangle, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { exportExcel } from '@/lib/export-excel'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'

type SubTab = 'summary' | 'low_stock' | 'parts_consumption' | 'parts_consumption_by_brand' | 'adjustments' | 'stale_repairs'

interface InventorySummaryRow { product_id: string; product_name: string; sku: string | null; category: string; quantity: number; cost_price: number; stock_value: number; retail_value: number }
interface PartConsumptionRow  { product_id: string; product_name: string; sku: string | null; brand_name: string; quantity: number; total_cost: number }
interface BrandConsumptionRow { brand_id: string; brand_name: string; quantity: number; total_cost: number }
interface AdjustmentRow       { id: string; product_id: string; quantity_change: number; reason: string | null; reference_type: string | null; created_at: string; products: { name: string; sku: string | null } | null }
interface LowStockRow         { id: string; product_id: string; quantity: number; low_stock_alert: number; products?: { id: string; name: string; sku: string | null } | null }
interface InventoryOverview   { low_stock_count: number; low_stock_items: LowStockRow[]; total_items: number; total_value: number }
interface StaleRepairRow {
  repair_id: string; job_number: string; customer_name: string | null; device: string | null
  status: string; created_at: string; days_open: number; parts_count: number; total_cost_at_risk: number
}

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }

export default function InventoryReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [subTab, setSubTab] = useState<SubTab>('summary')

  const { data: overview = null, refetch: refetchOverview } = useQuery<InventoryOverview | null>({
    queryKey: ['report-inventory-overview', activeBranch?.id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'inventory', branch_id: activeBranch!.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      return json.data ?? null
    },
    enabled: !!activeBranch,
    staleTime: 60_000,
  })

  const { data: detailData = [], isLoading: loading, refetch: refetchDetail } = useQuery<unknown[]>({
    queryKey: ['report-inventory-detail', activeBranch?.id, dateFrom, dateTo, subTab],
    queryFn: async () => {
      const params = new URLSearchParams({ branch_id: activeBranch!.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59`, subtype: subTab })
      const res = await fetch(`/api/reports/inventory-detail?${params}`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!activeBranch && subTab !== 'low_stock',
    staleTime: 60_000,
  })

  function handleApply() {
    refetchOverview()
    if (subTab !== 'low_stock') refetchDetail()
  }

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
    { accessorKey: 'brand_name',   header: 'Brand' },
    { accessorKey: 'quantity',     header: 'Qty Used' },
    { accessorKey: 'total_cost',   header: 'Total Cost', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const brandColumns: ColumnDef<BrandConsumptionRow>[] = [
    { accessorKey: 'brand_name', header: 'Brand' },
    { accessorKey: 'quantity',   header: 'Qty Used' },
    { accessorKey: 'total_cost', header: 'Total Cost', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  ]

  const staleRepairColumns: ColumnDef<StaleRepairRow>[] = [
    { accessorKey: 'job_number',    header: 'Job #' },
    { accessorKey: 'customer_name', header: 'Customer', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'device',        header: 'Device',   cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'status',        header: 'Status',   cell: ({ getValue }) => <span className="capitalize">{(getValue() as string).replace('_', ' ')}</span> },
    { accessorKey: 'days_open',     header: 'Days Open', cell: ({ getValue }) => {
      const v = getValue() as number
      return <span className={v >= 30 ? 'font-semibold text-red-600' : v >= 14 ? 'font-semibold text-orange-600' : ''}>{v}</span>
    }},
    { accessorKey: 'parts_count',        header: 'Parts' },
    { accessorKey: 'total_cost_at_risk',  header: 'Cost At Risk', cell: ({ getValue }) => formatCurrency(getValue() as number) },
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
    if (subTab === 'summary')           exportExcel(detailData as unknown as Record<string, unknown>[], `inventory-summary-${dateFrom}-${dateTo}.xlsx`)
    if (subTab === 'parts_consumption') exportExcel(detailData as unknown as Record<string, unknown>[], `parts-usage-${dateFrom}-${dateTo}.xlsx`)
    if (subTab === 'parts_consumption_by_brand') exportExcel(detailData as unknown as Record<string, unknown>[], `parts-usage-by-brand-${dateFrom}-${dateTo}.xlsx`)
    if (subTab === 'adjustments')       exportExcel(detailData as unknown as Record<string, unknown>[], `adjustments-${dateFrom}-${dateTo}.xlsx`)
    if (subTab === 'stale_repairs')     exportExcel(detailData as unknown as Record<string, unknown>[], `stale-repair-parts-${dateFrom}-${dateTo}.xlsx`)
    if (subTab === 'low_stock' && overview) exportExcel(overview.low_stock_items as unknown as Record<string, unknown>[], `low-stock-${dateFrom}-${dateTo}.xlsx`)
  }

  const SUB_TABS: { value: SubTab; label: string }[] = [
    { value: 'summary',           label: 'Summary'     },
    { value: 'low_stock',         label: 'Low Stock'   },
    { value: 'parts_consumption', label: 'Part Usage'  },
    { value: 'parts_consumption_by_brand', label: 'By Brand' },
    { value: 'adjustments',       label: 'Adjustments' },
    { value: 'stale_repairs',     label: 'Stale Repairs' },
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
          <Download className="h-4 w-4" /> Export Excel
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
        <DataTable data={detailData as InventorySummaryRow[]} columns={summaryColumns} isLoading={loading} emptyMessage="No inventory data." />
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
                <th className="px-4 py-2 text-right">Stock</th>
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
        <DataTable data={detailData as PartConsumptionRow[]} columns={partColumns} isLoading={loading} emptyMessage="No part consumption data for this period." />
      )}

      {/* Part usage rolled up by brand — e.g. tyre brand breakdown for the mobile tyre-fitting vertical */}
      {subTab === 'parts_consumption_by_brand' && (
        <DataTable data={detailData as BrandConsumptionRow[]} columns={brandColumns} isLoading={loading} emptyMessage="No brand data for this period." />
      )}

      {/* Adjustments */}
      {subTab === 'adjustments' && (
        <DataTable data={detailData as AdjustmentRow[]} columns={adjColumns} isLoading={loading} emptyMessage="No inventory adjustments for this period." />
      )}

      {/* Stale repairs — parts already deducted from stock, cost not yet in P&L */}
      {subTab === 'stale_repairs' && (
        <>
          <p className="text-xs text-on-surface-variant">
            Repair jobs open 14+ days whose parts were already pulled from stock at booking time, but whose cost won&apos;t
            hit Profit &amp; Loss until the job is marked complete/collected. Long-open tickets here mean that cost is
            currently missing from your reports.
          </p>
          <DataTable data={detailData as StaleRepairRow[]} columns={staleRepairColumns} isLoading={loading} emptyMessage="No stale open repairs with deducted parts." />
        </>
      )}
    </div>
  )
}
