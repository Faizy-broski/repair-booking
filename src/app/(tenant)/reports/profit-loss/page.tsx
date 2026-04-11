'use client'
import { useState, useEffect, useCallback } from 'react'
import { Download, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { DateRangeBar } from '../_components/date-range-bar'
import Link from 'next/link'

interface ProfitLossData {
  revenue: number; repair_revenue: number; total_revenue: number
  cogs: number; expenses: number; salaries: number; total_costs: number
  gross_profit: number; net_profit: number
}

function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] }
function today() { return new Date().toISOString().split('T')[0] }
function exportCsv(data: ProfitLossData, filename: string) {
  const rows = Object.entries(data).map(([k, v]) => `${k},${v}`)
  const csv = ['metric,value', ...rows].join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = filename; a.click()
}

export default function ProfitLossReportPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ProfitLossData | null>(null)

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: 'profit_loss', branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      setData(json.data ?? null)
    } finally { setLoading(false) }
  }, [activeBranch, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

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
            <h1 className="text-2xl font-bold text-on-surface">Profit & Loss</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Revenue, costs and net profit analysis</p>
          </div>
        </div>
        <Button size="sm" className="w-full sm:w-auto" onClick={() => data && exportCsv(data, `pl-${dateFrom}-${dateTo}.csv`)} disabled={!data}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <DateRangeBar dateFrom={dateFrom} dateTo={dateTo} onFrom={setDateFrom} onTo={setDateTo} onApply={fetchData} />

      {loading && (
        <div className="rounded-xl border border-outline-variant bg-surface p-8 text-center text-sm text-on-surface-variant">Loading…</div>
      )}

      {!loading && !data && (
        <div className="flex h-32 items-center justify-center rounded-xl border border-outline-variant bg-surface text-sm text-on-surface-variant">
          No profit/loss data for this period.
        </div>
      )}

      {data && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: 'Total Revenue', value: data.total_revenue, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Total Costs',   value: data.total_costs,   color: 'text-red-600',  bg: 'bg-red-50' },
              { label: 'Net Profit',    value: data.net_profit,    color: data.net_profit >= 0 ? 'text-green-600' : 'text-red-600', bg: data.net_profit >= 0 ? 'bg-green-50' : 'bg-red-50' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className="rounded-xl border border-outline-variant bg-surface p-4">
                <div className={`inline-flex rounded-lg p-2 ${bg} mb-2`} />
                <p className="text-sm text-on-surface-variant">{label}</p>
                <p className={`mt-1 text-2xl font-bold sm:text-3xl ${color}`}>{formatCurrency(value)}</p>
              </div>
            ))}
          </div>

          {/* Breakdown */}
          <div className="rounded-xl border border-outline-variant bg-surface p-5">
            <h3 className="mb-4 text-base font-semibold text-on-surface">Breakdown</h3>
            <div className="space-y-0 text-base divide-y divide-outline-variant/50">
              {([
                { label: 'Sales Revenue',        value: data.revenue,         indent: false, bold: false },
                { label: 'Repair Revenue',        value: data.repair_revenue,  indent: false, bold: false },
                { label: 'Cost of Goods (COGS)',  value: -data.cogs,           indent: true,  bold: false },
                { label: 'Gross Profit',          value: data.gross_profit,    indent: false, bold: true  },
                { label: 'Operating Expenses',    value: -data.expenses,       indent: true,  bold: false },
                { label: 'Salaries',              value: -data.salaries,       indent: true,  bold: false },
                { label: 'Net Profit',            value: data.net_profit,      indent: false, bold: true  },
              ] as { label: string; value: number; indent: boolean; bold: boolean }[]).map(({ label, value, indent, bold }) => (
                <div key={label} className={`flex justify-between py-2.5 ${bold ? 'font-semibold' : ''}`}>
                  <span className={`${indent ? 'pl-4 text-on-surface-variant' : 'text-on-surface'}`}>{indent ? `— ${label}` : label}</span>
                  <span className={value < 0 ? 'text-red-600' : value > 0 ? 'text-green-700' : 'text-on-surface-variant'}>
                    {value < 0 ? `(${formatCurrency(Math.abs(value))})` : formatCurrency(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
