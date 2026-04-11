'use client'
import { useState, useEffect, useCallback } from 'react'
import { Download, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/shared/data-table'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'
import type { ColumnDef } from '@tanstack/react-table'

interface TaxRow { tax_class: string; total_tax: number }

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }
function exportCsv<T extends Record<string, unknown>>(rows: T[], filename: string) {
  if (!rows.length) return
  const h = Object.keys(rows[0])
  const csv = [h.join(','), ...rows.map((r) => h.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = filename; a.click()
}

export default function TaxReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<{ rows: TaxRow[]; grand_total: number } | null>(null)

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: 'tax', branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      setData(json.data ?? null)
    } finally { setLoading(false) }
  }, [activeBranch, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  const columns: ColumnDef<TaxRow>[] = [
    { accessorKey: 'tax_class', header: 'Tax Class' },
    { accessorKey: 'total_tax', header: 'Tax Collected', cell: ({ getValue }) => formatCurrency(getValue() as number) },
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
            <h1 className="text-2xl font-bold text-on-surface">Tax Report</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Tax collected by class for the selected period</p>
          </div>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => data && exportCsv(data.rows as unknown as Record<string, unknown>[], `tax-${dateFrom}-${dateTo}.csv`)} disabled={!data}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={fetchData} />

      {data && (
        <div className="rounded-xl border border-outline-variant bg-surface p-4">
          <p className="text-sm text-on-surface-variant">Total Tax Collected</p>
          <p className="mt-1 text-2xl font-bold text-orange-600 sm:text-3xl">{formatCurrency(data.grand_total)}</p>
        </div>
      )}

      {!loading && !data && (
        <div className="flex h-32 items-center justify-center rounded-xl border border-outline-variant bg-surface text-sm text-on-surface-variant">
          No tax data for this period.
        </div>
      )}

      {data && (
        <>
          <DataTable data={data.rows} columns={columns} isLoading={loading} emptyMessage="No tax data." />
          <div className="flex justify-end rounded-xl border border-outline-variant bg-surface px-4 py-3">
            <span className="text-base font-semibold text-on-surface">Grand Total: {formatCurrency(data.grand_total)}</span>
          </div>
        </>
      )}
    </div>
  )
}
