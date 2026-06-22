'use client'
import { useState } from 'react'
import { Banknote, Wrench, ArrowLeftRight, TrendingUp, AlertTriangle, Clock, Package, Receipt } from 'lucide-react'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useAuthStore } from '@/store/auth.store'
import { cn, formatCurrency } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'

interface DashboardStats {
  total_sales: number
  sales_count: number
  repairs_open: number
  repairs_completed: number
  repairs_urgent: number
  repairs_revenue: number
  total_expenses: number
  low_stock_count: number
  net_profit: number
  sales_profit: number
  repairs_profit: number
}

interface BranchRevenue {
  branchId: string
  branchName: string
  total: number
}

interface RecentRepair {
  id: string
  job_number: string
  device: string
  issue: string
  status: string
  created_at: string | null
  customer_name: string
}

interface RecentActivity {
  id: string
  status: string
  note: string | null
  created_at: string | null
  repair_id: string | null
  job_number: string | null
  device: string
  changed_by: string | null
}

/* ── Activity helpers ─────────────────────────────────────── */
const ACTIVITY_META: Record<string, { label: string; dot: string }> = {
  pending:       { label: 'New Repair Logged',   dot: 'bg-gray-400' },
  diagnosing:    { label: 'Diagnosis Started',   dot: 'bg-amber-500' },
  waiting_parts: { label: 'Waiting for Parts',   dot: 'bg-orange-400' },
  in_progress:   { label: 'Repair in Progress',  dot: 'bg-blue-500' },
  repaired:      { label: 'Repair Complete',     dot: 'bg-green-500' },
  collected:     { label: 'Customer Collected',  dot: 'bg-teal-500' },
  unrepairable:  { label: 'Marked Unrepairable', dot: 'bg-red-500' },
}

function formatActivityTime(ts: string) {
  const d = new Date(ts)
  const now = new Date()
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return `${timeStr} Today`
  const yest = new Date(now); yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${timeStr}`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + `, ${timeStr}`
}

/* ── Status badge ──────────────────────────────────────────── */
const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending:       { label: 'Pending',       className: 'bg-secondary-container text-on-secondary-container' },
  diagnosing:    { label: 'Diagnosing',    className: 'bg-tertiary-container/40 text-tertiary' },
  waiting_parts: { label: 'Waiting Parts', className: 'bg-secondary-fixed-dim text-on-secondary-fixed' },
  in_progress:   { label: 'In Progress',   className: 'bg-primary-container text-on-primary-container' },
  repaired:      { label: 'Repaired',      className: 'bg-primary-container text-on-primary-fixed' },
  collected:     { label: 'Collected',     className: 'bg-surface-container-high text-on-surface-variant' },
  unrepairable:  { label: 'Unrepairable',  className: 'bg-error-container/20 text-error' },
}

function RepairStatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, className: 'bg-surface-container text-on-surface-variant' }
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.className}`}>
      {s.label}
    </span>
  )
}

/* ── Page ──────────────────────────────────────────────────── */
const PERIODS = [
  { value: 'month',   label: 'This Month' },
  { value: '3months', label: '3 Months'   },
  { value: '6months', label: '6 Months'   },
  { value: 'year',    label: 'This Year'  },
] as const
type Period = typeof PERIODS[number]['value']

export default function DashboardPage() {
  const { activeBranch, isOwner, isLoading: authLoading } = useAuthStore()
  const branchId = activeBranch?.id ?? null
  const [period, setPeriod] = useState<Period>('month')

  // Fast: stats + widgets — renders as soon as the 11 parallel queries return
  const { data: mainData, isLoading: mainQueryLoading } = useQuery({
    queryKey: ['dashboard-main', branchId, period],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?branch_id=${branchId}&period=${period}&section=main`)
      const json = await res.json()
      return json.data ?? {}
    },
    enabled: !!branchId,
    staleTime: 5 * 60 * 1000,
  })

  // Slow: revenue chart — renders independently so it never blocks the widgets above
  const { data: revenueData, isLoading: revenueQueryLoading } = useQuery({
    queryKey: ['dashboard-revenue', branchId, period],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?branch_id=${branchId}&period=${period}&section=revenue`)
      const json = await res.json()
      return json.data ?? {}
    },
    enabled: !!branchId,
    staleTime: 5 * 60 * 1000,
  })

  const loading        = authLoading || mainQueryLoading || !branchId
  const revenueLoading = authLoading || revenueQueryLoading || !branchId

  const stats          = (mainData?.stats          ?? null) as DashboardStats | null
  const branchRevenue  = (revenueData?.branchRevenue ?? []) as BranchRevenue[]
  const recentRepairs  = (mainData?.recentRepairs   ?? [])  as RecentRepair[]
  const recentActivity = (mainData?.recentActivity  ?? [])  as RecentActivity[]

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-on-surface">
            {isOwner() ? 'Business Overview' : `${activeBranch?.name ?? ''} Dashboard`}
          </h1>
          <p className="text-sm text-on-surface-variant">
            {PERIODS.find(p => p.value === period)?.label}
          </p>
        </div>

        {/* Period selector */}
        <div className="flex items-center rounded-xl border border-outline-variant bg-surface-container-lowest p-1 gap-1 self-start sm:self-auto">
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                period === value
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats Grid (6 cards) ── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 sm:h-32 animate-pulse rounded-xl bg-surface-container" />
          ))
        ) : (
          <>
            {/* Row 1 — Sales & Repairs */}
            <StatsCard title="Sales Revenue" value={formatCurrency(stats?.total_sales ?? 0)} subtitle={PERIODS.find(p => p.value === period)?.label} icon={<Banknote className="h-5 w-5" />} color="green" />
            <StatsCard title="Sales Profit" value={formatCurrency(stats?.sales_profit ?? 0)} subtitle="revenue − cost of goods" icon={<TrendingUp className="h-5 w-5" />} color={(stats?.sales_profit ?? 0) >= 0 ? 'green' : 'red'} />
            <StatsCard title="Repairs Revenue" value={formatCurrency(stats?.repairs_revenue ?? 0)} subtitle="collected" icon={<Receipt className="h-5 w-5" />} color="purple" />
            {/* Row 2 — Operations */}
            <StatsCard title="Net Profit" value={formatCurrency(stats?.net_profit ?? 0)} subtitle="all revenue − expenses" icon={<TrendingUp className="h-5 w-5" />} color={(stats?.net_profit ?? 0) >= 0 ? 'green' : 'red'} />
            <StatsCard title="Transactions" value={stats?.sales_count ?? 0} subtitle={PERIODS.find(p => p.value === period)?.label} icon={<ArrowLeftRight className="h-5 w-5" />} color="blue" />
            <StatsCard title="Open Repairs" value={stats?.repairs_open ?? 0} icon={<Wrench className="h-5 w-5" />} color="yellow" />
            <StatsCard title="Total Expenses" value={formatCurrency(stats?.total_expenses ?? 0)} subtitle={PERIODS.find(p => p.value === period)?.label} icon={<TrendingUp className="h-5 w-5" />} color="red" />
            <StatsCard title="Low Stock" value={stats?.low_stock_count ?? 0} subtitle="items" icon={<AlertTriangle className="h-5 w-5" />} color={(stats?.low_stock_count ?? 0) > 0 ? 'red' : 'green'} />
          </>
        )}
      </div>

      {/* ── Revenue by Branch (owner only) ── */}
      {isOwner() && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Branch</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueLoading ? (
              <div className="h-64 animate-pulse rounded-lg bg-surface-container" />
            ) : branchRevenue.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={branchRevenue.map((b) => ({ name: b.branchName, revenue: b.total }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-container)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => v >= 1000 ? `£${(v / 1000).toFixed(1)}k` : `£${v}`} />
                    <Tooltip formatter={(v) => formatCurrency(v as number)} />
                    <Bar dataKey="revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-on-surface-variant">No sales data yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Recent Repairs + Activity Log (side by side) ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-primary" />
                Recent Repair Tickets
              </CardTitle>
              <Link href="/repairs" className="text-xs font-medium text-primary hover:text-primary-dim transition-colors">
                View all →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="divide-y divide-outline-variant">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-6 py-3">
                      <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-surface-container" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-surface-container" />
                        <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-container" />
                      </div>
                      <div className="h-5 w-16 animate-pulse rounded-full bg-surface-container" />
                    </div>
                  ))}
                </div>
              ) : recentRepairs.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-on-surface-variant">No repair tickets yet.</p>
              ) : (
                <div className="h-[500px] overflow-y-auto divide-y divide-outline-variant">
                  {recentRepairs.map((r) => (
                    <Link
                      key={r.id}
                      href={`/repairs/${r.id}`}
                      className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-surface-container-low"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container">
                        <Wrench className="h-4 w-4 text-on-primary-container" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-semibold text-primary">#{r.job_number}</span>
                          <span className="truncate text-sm font-medium text-on-surface">{r.device}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="truncate text-xs text-on-surface-variant">{r.customer_name}</span>
                          <span className="text-xs text-outline">·</span>
                          <span className="truncate text-xs text-on-surface-variant">{r.issue}</span>
                        </div>
                      </div>
                      <RepairStatusBadge status={r.status} />
                      <div className="hidden sm:flex items-center gap-1 text-xs text-outline shrink-0">
                        <Clock className="h-3 w-3" />
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Log — 1/3 width */}
          <Card className="lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-primary" />
                Activity Log
              </CardTitle>
              <Link href="/repairs" className="text-xs font-medium text-primary hover:text-primary-dim transition-colors">
                View All →
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-0">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="mt-1 h-4 w-4 shrink-0 animate-pulse rounded-full bg-surface-container" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2 w-16 animate-pulse rounded bg-surface-container" />
                        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-container" />
                        <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-container" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-on-surface-variant">No activity yet.</p>
              ) : (
                <div className="relative h-[500px] overflow-y-auto">
                  <div className="absolute left-[31px] top-3 bottom-3 w-px bg-gray-200" />
                  {recentActivity.map((a) => {
                    const meta = ACTIVITY_META[a.status] ?? { label: a.status, dot: 'bg-gray-400' }
                    return (
                      <Link
                        key={a.id}
                        href={a.repair_id ? `/repairs/${a.repair_id}` : '#'}
                        className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-container-low transition-colors"
                      >
                        <div className="relative z-10 mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
                          <div className={`h-2.5 w-2.5 rounded-full ${meta.dot} ring-2 ring-white`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-on-surface-variant mb-0.5 leading-none">
                            {a.created_at ? formatActivityTime(a.created_at) : '—'}
                          </p>
                          <p className="text-xs font-bold text-on-surface leading-snug">{meta.label}</p>
                          <p className="text-[11px] text-on-surface-variant truncate">
                            {a.device}{a.job_number ? ` · #${a.job_number}` : ''}
                          </p>
                          {a.changed_by && (
                            <p className="text-[10px] text-outline truncate">by {a.changed_by}</p>
                          )}
                          {a.note && (
                            <p className="mt-0.5 text-[10px] italic text-on-surface-variant truncate">&ldquo;{a.note}&rdquo;</p>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

        </div>

    </div>
  )
}
