'use client'
import { useState, useEffect, useCallback } from 'react'
import { Download, ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { ColumnDef } from '@tanstack/react-table'

interface SalesRow { date: string; total_sales: number; transaction_count: number; avg_order_value: number }

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }
function exportCsv<T extends Record<string, unknown>>(rows: T[], filename: string) {
  if (!rows.length) return
  const h = Object.keys(rows[0])
  const csv = [h.join(','), ...rows.map((r) => h.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = filename; a.click()
}

export default function SalesReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<SalesRow[]>([])

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: 'sales', branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      const grouped: Record<string, { total: number; count: number }> = {}
      for (const s of json.data ?? []) {
        const d = s.created_at?.split('T')[0] ?? ''
        if (!grouped[d]) grouped[d] = { total: 0, count: 0 }
        grouped[d].total += s.total ?? 0
        grouped[d].count += 1
      }
      setData(Object.entries(grouped).map(([date, { total, count }]) => ({
        date, total_sales: total, transaction_count: count, avg_order_value: count ? total / count : 0,
      })))
    } finally { setLoading(false) }
  }, [activeBranch, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  const totalRevenue = data.reduce((s, r) => s + r.total_sales, 0)
  const totalTxns    = data.reduce((s, r) => s + r.transaction_count, 0)
  const avgOrder     = totalTxns > 0 ? totalRevenue / totalTxns : 0

  const columns: ColumnDef<SalesRow>[] = [
    { accessorKey: 'date',              header: 'Date',         cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorKey: 'transaction_count', header: 'Transactions' },
    { accessorKey: 'total_sales',       header: 'Revenue',      cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'avg_order_value',   header: 'Avg. Order',   cell: ({ getValue }) => formatCurrency(getValue() as number) },
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
            <h1 className="text-2xl font-bold text-on-surface">Sales Report</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Daily transaction and revenue breakdown</p>
          </div>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => exportCsv(data as unknown as Record<string, unknown>[], `sales-${dateFrom}-${dateTo}.csv`)}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={fetchData} />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Total Revenue',  value: formatCurrency(totalRevenue) },
          { label: 'Transactions',   value: String(totalTxns) },
          { label: 'Avg. Order',     value: formatCurrency(avgOrder) },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-outline-variant bg-surface p-4">
            <p className="text-sm text-on-surface-variant">{k.label}</p>
            <p className="mt-1 text-2xl font-bold text-on-surface sm:text-3xl">{k.value}</p>
          </div>
        ))}
      </div>

      {data.length > 0 && (
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="mb-3 text-base font-semibold text-on-surface">Daily Revenue</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-container-high, #f0f0f0)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => formatDate(v)} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `£${v}`} />
              <Tooltip formatter={(v: unknown) => formatCurrency(v as number)} />
              <Bar dataKey="total_sales" fill="#0d9488" radius={[4, 4, 0, 0]} name="Revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <DataTable data={data} columns={columns} isLoading={loading} emptyMessage="No sales data for this period." />
    </div>
  )
}
