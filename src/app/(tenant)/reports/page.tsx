'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Wrench, RefreshCw,
  Receipt, PieChart, Users, FileText, CreditCard, Package, BarChart2, Lock,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { DateRangeBar } from './_components/date-range-bar'
import Link from 'next/link'

function firstOfMonth() {
  const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
}
function today() { return new Date().toISOString().split('T')[0] }

interface SummaryStats {
  total_revenue: number
  total_transactions: number
  total_repairs: number
  net_profit: number
}

interface RegisterSession {
  id: string
  opening_float: number
  opened_at: string
  status: string
}

const REPORT_LINKS = [
  { href: '/reports/sales',       label: 'Sales',       desc: 'Daily revenue & transaction breakdown',    icon: Receipt,    color: 'bg-blue-50 text-blue-600' },
  { href: '/reports/profit-loss', label: 'P&L',         desc: 'Revenue, costs & net profit analysis',     icon: TrendingUp, color: 'bg-green-50 text-green-600' },
  { href: '/reports/repairs',     label: 'Repairs',     desc: 'Repair job status & revenue',              icon: Wrench,     color: 'bg-purple-50 text-purple-600' },
  { href: '/reports/tax',         label: 'Tax',         desc: 'Tax collected by class & period',          icon: FileText,   color: 'bg-orange-50 text-orange-600' },
  { href: '/reports/payments',    label: 'Payments',    desc: 'Revenue split by payment method',          icon: CreditCard, color: 'bg-pink-50 text-pink-600' },
  { href: '/reports/employees',   label: 'Employees',   desc: 'Staff productivity & commission',          icon: Users,      color: 'bg-teal-50 text-teal-600' },
  { href: '/reports/inventory',   label: 'Inventory',   desc: 'Stock value, low stock & adjustments',     icon: Package,    color: 'bg-amber-50 text-amber-600' },
  { href: '/reports/z-report',    label: 'Z-Report',    desc: 'Daily register sessions & cash variance',  icon: BarChart2,  color: 'bg-slate-50 text-slate-600' },
]

export default function ReportsOverviewPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<SummaryStats>({ total_revenue: 0, total_transactions: 0, total_repairs: 0, net_profit: 0 })
  const [currentSession, setCurrentSession] = useState<RegisterSession | null>(null)

  const fetchStats = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: 'dashboard', branch_id: activeBranch.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      const d = json.data ?? {}
      const salesArr: Array<{ total?: number }> = d.sales ?? []
      const repairsArr: unknown[] = d.repairs ?? []
      const pl = d.profitLoss ?? {}
      setStats({
        total_revenue: pl.total_revenue ?? salesArr.reduce((s: number, r) => s + (r.total ?? 0), 0),
        total_transactions: salesArr.length,
        total_repairs: repairsArr.length,
        net_profit: pl.net_profit ?? 0,
      })
    } finally { setLoading(false) }
  }, [activeBranch, dateFrom, dateTo])

  const fetchSession = useCallback(async () => {
    if (!activeBranch) return
    const res = await fetch(`/api/pos/session?branch_id=${activeBranch.id}`)
    const json = await res.json()
    setCurrentSession(json.data)
  }, [activeBranch])

  useEffect(() => {
    fetchStats()
    fetchSession()
  }, [activeBranch]) // eslint-disable-line react-hooks/exhaustive-deps

  const statsCards = [
    { label: 'Total Revenue', value: formatCurrency(stats.total_revenue), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Transactions',  value: String(stats.total_transactions),    icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Repairs',       value: String(stats.total_repairs),         icon: Wrench,       color: 'text-purple-600', bg: 'bg-purple-50' },
    {
      label: 'Net Profit',
      value: formatCurrency(stats.net_profit),
      icon: stats.net_profit >= 0 ? TrendingUp : TrendingDown,
      color: stats.net_profit >= 0 ? 'text-green-600' : 'text-red-600',
      bg: stats.net_profit >= 0 ? 'bg-green-50' : 'bg-red-50',
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Reports</h1>
          <p className="text-base text-on-surface-variant mt-0.5">Business performance analytics</p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchStats} loading={loading} className="w-full sm:w-auto">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Register ribbon */}
      {currentSession ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2.5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="text-base font-medium text-amber-800">
              Register open — Float: {formatCurrency(currentSession.opening_float)}
            </span>
          </div>
          <Link href="/reports/z-report" className="w-full sm:w-auto">
            <Button size="sm" variant="outline" className="w-full sm:w-auto">Close Register →</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2.5">
          <span className="text-base text-on-surface-variant">No register session open</span>
          <Link href="/reports/z-report" className="w-full sm:w-auto">
            <Button size="sm" className="w-full sm:w-auto">Open Register</Button>
          </Link>
        </div>
      )}

      {/* Date range */}
      <DateRangeBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onFrom={setDateFrom}
        onTo={setDateTo}
        onApply={fetchStats}
      />

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statsCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-outline-variant bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-on-surface-variant leading-tight">{card.label}</p>
              <div className={`rounded-lg p-2 shrink-0 ${card.bg}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className={`mt-2 text-2xl font-bold sm:text-3xl ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Report cards */}
      <div>
        <h2 className="text-base font-semibold text-on-surface-variant uppercase tracking-wide mb-3">All Reports</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {REPORT_LINKS.map((r) => (
            <Link key={r.href} href={r.href}>
              <div className="group flex items-center justify-between rounded-xl border border-outline-variant bg-surface p-5 hover:border-brand-teal hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2.5 ${r.color.split(' ')[0]}`}>
                    <r.icon className={`h-5 w-5 ${r.color.split(' ')[1]}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-on-surface text-base">{r.label}</p>
                    <p className="text-sm text-on-surface-variant mt-0.5 leading-tight">{r.desc}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-on-surface-variant group-hover:text-brand-teal transition-colors shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
