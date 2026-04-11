'use client'
import { useState, useEffect, useCallback } from 'react'
import { Download, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { ColumnDef } from '@tanstack/react-table'

interface RepairRow { status: string; count: number; total_value: number }

const STATUS_COLORS: Record<string, string> = {
  pending:    '#f59e0b',
  in_progress:'#3b82f6',
  completed:  '#22c55e',
  cancelled:  '#ef4444',
  waiting_parts: '#8b5cf6',
}

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }
function exportCsv<T extends Record<string, unknown>>(rows: T[], filename: string) {
  if (!rows.length) return
  const h = Object.keys(rows[0])
  const csv = [h.join(','), ...rows.map((r) => h.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = filename; a.click()
}

export default function RepairsReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<RepairRow[]>([])

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: 'repairs', branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      const grouped: Record<string, { count: number; value: number }> = {}
      for (const r of json.data ?? []) {
        grouped[r.status] = grouped[r.status] ?? { count: 0, value: 0 }
        grouped[r.status].count += 1
        grouped[r.status].value += r.actual_cost ?? 0
      }
      setData(Object.entries(grouped).map(([status, { count, value }]) => ({ status, count, total_value: value })))
    } finally { setLoading(false) }
  }, [activeBranch, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  const totalRepairs = data.reduce((s, r) => s + r.count, 0)
  const totalValue   = data.reduce((s, r) => s + r.total_value, 0)

  const columns: ColumnDef<RepairRow>[] = [
    { accessorKey: 'status',      header: 'Status',      cell: ({ getValue }) => <span className="capitalize">{(getValue() as string).replace(/_/g, ' ')}</span> },
    { accessorKey: 'count',       header: 'Count' },
    { accessorKey: 'total_value', header: 'Total Value', cell: ({ getValue }) => formatCurrency(getValue() as number) },
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
            <h1 className="text-2xl font-bold text-on-surface">Repairs Report</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Repair job status and revenue breakdown</p>
          </div>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => exportCsv(data as unknown as Record<string, unknown>[], `repairs-${dateFrom}-${dateTo}.csv`)}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={fetchData} />

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <p className="text-sm text-on-surface-variant">Total Repairs</p>
          <p className="mt-1 text-2xl font-bold text-on-surface sm:text-3xl">{totalRepairs}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <p className="text-sm text-on-surface-variant">Total Value</p>
          <p className="mt-1 text-2xl font-bold text-green-600 sm:text-3xl">{formatCurrency(totalValue)}</p>
        </div>
      </div>

      {data.length > 0 && (
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <h3 className="mb-3 text-base font-semibold text-on-surface">Status Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80}
                label={({ status, percent }) => `${status.replace(/_/g, ' ')} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                {data.map((row, i) => (
                  <Cell key={i} fill={STATUS_COLORS[row.status] ?? '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <DataTable data={data} columns={columns} isLoading={loading} emptyMessage="No repair data for this period." />
    </div>
  )
}
