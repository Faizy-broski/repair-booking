'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, Banknote, ShoppingCart, Wrench, RefreshCw,
  Receipt, PieChart, Users, FileText, CreditCard, Package, BarChart2, Lock,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { MetricCard } from '@/components/shared/ui-kit'
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
  { href: '/reports/sales',       label: 'Sales',       desc: 'Daily revenue & transaction breakdown',    icon: Receipt,    color: 'bg-primary/10 text-primary' },
  { href: '/reports/profit-loss', label: 'P&L',         desc: 'Revenue, costs & net profit analysis',     icon: TrendingUp, color: 'bg-primary/10 text-primary' },
  { href: '/reports/repairs',     label: 'Repairs',     desc: 'Repair job status & revenue',              icon: Wrench,     color: 'bg-primary/10 text-primary' },
  { href: '/reports/tax',         label: 'Tax',         desc: 'Tax collected by class & period',          icon: FileText,   color: 'bg-primary/10 text-primary' },
  { href: '/reports/payments',    label: 'Payments',    desc: 'Revenue split by payment method',          icon: CreditCard, color: 'bg-primary/10 text-primary' },
  { href: '/reports/cash-card-ledger', label: 'Cash & Card Ledger', desc: 'Money in & out by cash and card, with detail', icon: Banknote, color: 'bg-primary/10 text-primary' },
  { href: '/reports/employees',   label: 'Employees',   desc: 'Staff productivity & commission',          icon: Users,      color: 'bg-primary/10 text-primary' },
  { href: '/reports/inventory',   label: 'Inventory',   desc: 'Stock value, low stock & adjustments',     icon: Package,    color: 'bg-primary/10 text-primary' },
  { href: '/reports/z-report',    label: 'Z-Report',    desc: 'Daily register sessions & cash variance',  icon: BarChart2,  color: 'bg-surface-container-low text-on-surface-variant' },
]

export default function ReportsOverviewPage() {
  const { activeBranch } = useAuthStore()
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo] = useState(today)
  const { data: statsData, isLoading: loading, refetch: fetchStats } = useQuery({
    queryKey: ['reports-stats', activeBranch?.id, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'dashboard', branch_id: activeBranch!.id, from: `${dateFrom}T00:00:00`, to: `${dateTo}T23:59:59` })
      const res = await fetch(`/api/reports?${params}`)
      const json = await res.json()
      const d = json.data ?? {}
      const salesArr: Array<{ total?: number }> = d.sales ?? []
      const repairsArr: unknown[] = d.repairs ?? []
      const pl = d.profitLoss ?? {}
      return {
        total_revenue: pl.total_revenue ?? salesArr.reduce((s: number, r) => s + (r.total ?? 0), 0),
        total_transactions: salesArr.length,
        total_repairs: repairsArr.length,
        net_profit: pl.net_profit ?? 0,
      } as SummaryStats
    },
    enabled: !!activeBranch,
  })

  const stats = statsData ?? { total_revenue: 0, total_transactions: 0, total_repairs: 0, net_profit: 0 }

  const { data: currentSession } = useQuery({
    queryKey: ['current-session', activeBranch?.id],
    queryFn: async () => {
      const res = await fetch(`/api/pos/session?branch_id=${activeBranch!.id}`)
      const json = await res.json()
      return (json.data ?? null) as RegisterSession | null
    },
    enabled: !!activeBranch,
    staleTime: 0,
  })

  const statsCards = [
    { label: 'Total Revenue', value: formatCurrency(stats.total_revenue), icon: Banknote, tone: 'bg-emerald-500/10 text-emerald-600' },
    { label: 'POS Transactions',  value: String(stats.total_transactions),    icon: ShoppingCart, tone: 'bg-primary/10 text-primary', title: 'Sales rung up through POS checkout only — repair payments taken directly in the Repairs module aren’t counted here.' },
    { label: 'Repairs',       value: String(stats.total_repairs),         icon: Wrench,       tone: 'bg-primary/10 text-primary' },
    {
      label: 'Net Profit',
      value: formatCurrency(stats.net_profit),
      icon: stats.net_profit >= 0 ? TrendingUp : TrendingDown,
      tone: stats.net_profit >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600',
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title="Reports"
        description="Business performance analytics"
        actions={
          <Button size="sm" variant="outline" onClick={fetchStats} loading={loading} className="w-full sm:w-auto">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {/* Register ribbon */}
      {currentSession ? (
        <div className="flex flex-col gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2.5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="text-base font-medium text-amber-700">
              Register open — Float: {formatCurrency(currentSession.opening_float)}
            </span>
          </div>
          <Link href="/reports/z-report" className="w-full sm:w-auto">
            <Button size="sm" variant="outline" className="w-full sm:w-auto">Close Register →</Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:py-2.5">
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statsCards.map((card) => (
          <div key={card.label} title={(card as { title?: string }).title} className="min-w-0">
            <MetricCard label={card.label} value={card.value} icon={card.icon} tone={card.tone} />
          </div>
        ))}
      </div>

      {/* Report cards */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-on-surface">All Reports</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REPORT_LINKS.map((r) => (
            <Link key={r.href} href={r.href}>
              <div className="group flex items-center justify-between rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 transition-colors hover:bg-surface-container-low cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-2.5 ${r.color.split(' ')[0]}`}>
                    <r.icon className={`h-5 w-5 ${r.color.split(' ')[1]}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-on-surface text-base">{r.label}</p>
                    <p className="text-sm text-on-surface-variant mt-0.5 leading-tight">{r.desc}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-on-surface-variant group-hover:text-primary transition-colors shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
