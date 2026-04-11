'use client'
import { useState, useEffect, useCallback } from 'react'
import { Download, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import type { ColumnDef } from '@tanstack/react-table'

interface PaymentRow { payment_method: string; total: number; count: number }

const COLORS = ['#0d9488', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6']

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }
function exportCsv<T extends Record<string, unknown>>(rows: T[], filename: string) {
  if (!rows.length) return
  const h = Object.keys(rows[0])
  const csv = [h.join(','), ...rows.map((r) => h.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = filename; a.click()
}

export default function PaymentsReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<PaymentRow[]>([])

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: 'payment_methods', branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      setData(json.data ?? [])
    } finally { setLoading(false) }
  }, [activeBranch, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  const totalRevenue = data.reduce((s, r) => s + r.total, 0)
  const totalTxns    = data.reduce((s, r) => s + r.count, 0)

  const columns: ColumnDef<PaymentRow>[] = [
    { accessorKey: 'payment_method', header: 'Method', cell: ({ getValue }) => <span className="capitalize">{(getValue() as string).replace(/_/g, ' ')}</span> },
    { accessorKey: 'count',          header: 'Transactions' },
    { accessorKey: 'total',          header: 'Revenue', cell: ({ getValue }) => formatCurrency(getValue() as number) },
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
            <h1 className="text-2xl font-bold text-on-surface">Payments Report</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Revenue breakdown by payment method</p>
          </div>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => exportCsv(data as unknown as Record<string, unknown>[], `payments-${dateFrom}-${dateTo}.csv`)}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={fetchData} />

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <p className="text-sm text-on-surface-variant">Total Revenue</p>
          <p className="mt-1 text-2xl font-bold text-green-600 sm:text-3xl">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <p className="text-sm text-on-surface-variant">Total Transactions</p>
          <p className="mt-1 text-2xl font-bold text-on-surface sm:text-3xl">{totalTxns}</p>
        </div>
      </div>

      {data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-outline-variant bg-surface p-4">
            <h3 className="mb-3 text-base font-semibold text-on-surface">Revenue Split</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data} dataKey="total" nameKey="payment_method" cx="50%" cy="50%" outerRadius={75}
                  label={({ payment_method, percent }) => `${payment_method.replace(/_/g,' ')} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: unknown) => formatCurrency(v as number)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-outline-variant bg-surface p-4">
            <h3 className="mb-3 text-base font-semibold text-on-surface">Transaction Count</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="payment_method" type="category" tick={{ fontSize: 11 }} width={80} tickFormatter={(v) => v.replace(/_/g,' ')} />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Transactions" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <DataTable data={data} columns={columns} isLoading={loading} emptyMessage="No payment data for this period." />
    </div>
  )
}
