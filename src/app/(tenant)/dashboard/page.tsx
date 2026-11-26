'use client'
import { useState } from 'react'
import { Banknote, Wrench, ArrowLeftRight, TrendingUp, AlertTriangle, Receipt, Wallet, Smartphone, CreditCard } from 'lucide-react'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useAuthStore } from '@/store/auth.store'
import { cn, formatCurrency } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
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
  today_cash_revenue: number
  today_card_revenue: number
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
  pending:       { label: 'New Repair Logged',   dot: 'bg-slate-400' },
  diagnosing:    { label: 'Diagnosing',          dot: 'bg-primary' },
  waiting_parts: { label: 'Awaiting Parts',      dot: 'bg-amber-500' },
  in_progress:   { label: 'In Progress',         dot: 'bg-blue-500' },
  repaired:      { label: 'Completed',           dot: 'bg-emerald-500' },
  collected:     { label: 'Customer Collected',  dot: 'bg-emerald-600' },
  unrepairable:  { label: 'Unrepairable',        dot: 'bg-red-500' },
}

function formatActivityTime(ts: string) {
  const d = new Date(ts)
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}

/* ── Status badge ──────────────────────────────────────────── */
const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending:       { label: 'Pending',        className: 'bg-surface-container text-on-surface-variant' },
  diagnosing:    { label: 'Diagnosing',     className: 'bg-primary/10 text-primary' },
  waiting_parts: { label: 'Awaiting Parts', className: 'bg-amber-500/10 text-amber-600' },
  in_progress:   { label: 'In Progress',    className: 'bg-blue-500/10 text-blue-600' },
  repaired:      { label: 'Completed',      className: 'bg-emerald-500/10 text-emerald-600' },
  collected:     { label: 'Collected',      className: 'bg-surface-container text-on-surface-variant' },
  unrepairable:  { label: 'Unrepairable',   className: 'bg-red-500/10 text-red-600' },
}

function RepairStatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { label: status, className: 'bg-surface-container text-on-surface-variant' }
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  )
}

/* Bar colours, cycled per branch: navy, brand teal, light cyan */
const BRANCH_COLORS = ['var(--navy)', 'var(--primary)', 'var(--primary-light)']

/* ── Page ──────────────────────────────────────────────────── */
const PERIODS = [
  { value: 'month',   label: 'This Month' },
  { value: '3months', label: '3 Months'   },
  { value: '6months', label: '6 Months'   },
  { value: 'year',    label: 'This Year'  },
] as const
type Period = typeof PERIODS[number]['value']

export default function DashboardPage() {
  const { activeBranch, isOwner, isLoading: authLoading, verticalTemplateSlug } = useAuthStore()
  const isRetail = verticalTemplateSlug === 'retail-store'
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

  const periodLabel = PERIODS.find(p => p.value === period)?.label

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface">
            {isOwner() ? 'Business Overview' : `${activeBranch?.name ?? ''} Dashboard`}
          </h1>
          <p className="mt-0.5 text-sm text-on-surface-variant">{periodLabel}</p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 self-start rounded-full border border-outline-variant bg-surface-container-lowest p-1 sm:self-auto">
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm font-medium transition-all',
                period === value
                  ? 'bg-navy text-white'
                  : 'text-on-surface-variant hover:text-on-surface'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats (2 / 4 per row, following the space beside the sidebar) ── */}
      <div className="@container">
      <div className="grid grid-cols-2 gap-4 @3xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[136px] animate-pulse rounded-2xl bg-surface-container" />
          ))
        ) : (
          <>
            {/* Row 1 */}
            <StatsCard title="Sales Revenue" value={formatCurrency(stats?.total_sales ?? 0)} subtitle={periodLabel} icon={<Banknote />} color="teal" />
            <StatsCard title="Sales Profit" value={formatCurrency(stats?.sales_profit ?? 0)} subtitle="After cost of goods" hint="Sales profit = sales revenue − cost of goods sold" icon={<TrendingUp />} color={(stats?.sales_profit ?? 0) >= 0 ? 'green' : 'red'} />
            <StatsCard title="Net Profit" value={formatCurrency(stats?.net_profit ?? 0)} subtitle="After expenses" hint="Net profit = all revenue (sales + repairs) − total expenses" icon={<Wallet />} color={(stats?.net_profit ?? 0) >= 0 ? 'blue' : 'red'} />
            <StatsCard title="Open Repairs" value={stats?.repairs_open ?? 0} subtitle="In the workshop" icon={<Wrench />} color="yellow" />
            {/* Row 2 */}
            {isRetail ? (
              <StatsCard title="Today's Card" value={formatCurrency(stats?.today_card_revenue ?? 0)} subtitle="Today" icon={<CreditCard />} color="teal" />
            ) : (
              <StatsCard title="Transactions" value={stats?.sales_count ?? 0} subtitle={periodLabel} icon={<ArrowLeftRight />} color="teal" />
            )}
            {isRetail ? (
              <StatsCard title="Today's Cash" value={formatCurrency(stats?.today_cash_revenue ?? 0)} subtitle="Today" icon={<Banknote />} color="green" />
            ) : (
              <StatsCard title="Repairs Revenue" value={formatCurrency(stats?.repairs_revenue ?? 0)} subtitle="Collected" icon={<Smartphone />} color="green" />
            )}
            <StatsCard title="Total Expenses" value={formatCurrency(stats?.total_expenses ?? 0)} subtitle={periodLabel} icon={<Receipt />} color="red" />
            <Link href="/inventory?low_stock=true" className="block h-full w-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <StatsCard title="Low Stock" value={stats?.low_stock_count ?? 0} subtitle={(stats?.low_stock_count ?? 0) > 0 ? 'Items below threshold' : 'All stocked'} icon={<AlertTriangle />} color={(stats?.low_stock_count ?? 0) > 0 ? 'red' : 'green'} className="cursor-pointer transition-colors hover:bg-surface-container-low" />
            </Link>
          </>
        )}
      </div>
      </div>

      {/* ── Revenue by Branch (owner only) ── */}
      {isOwner() && (
        <Card>
          <div className="px-5 pt-5">
            <CardTitle>Revenue by Branch</CardTitle>
            {branchRevenue.length > 0 && (
              <p className="mt-0.5 text-xs text-on-surface-variant">
                {branchRevenue.map((b) => b.branchName).join(', ').replace(/, ([^,]*)$/, ' and $1')}
              </p>
            )}
          </div>
          <CardContent className="pt-4 pb-5">
            {revenueLoading ? (
              <div className="h-72 animate-pulse rounded-xl bg-surface-container" />
            ) : branchRevenue.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={branchRevenue.map((b) => ({ name: b.branchName, revenue: b.total }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--hairline)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--on-surface-variant)' }} />
                    <YAxis axisLine={false} tickLine={false} width={48} tick={{ fontSize: 12, fill: 'var(--on-surface-variant)' }} tickFormatter={(v) => v >= 1000 ? `£${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `£${v}`} />
                    <Tooltip
                      cursor={{ fill: 'var(--surface-container-low)' }}
                      formatter={(v) => formatCurrency(v as number)}
                      contentStyle={{ background: 'var(--surface-container-lowest)', border: '1px solid var(--hairline)', borderRadius: 12 }}
                      itemStyle={{ color: 'var(--on-surface)' }}
                      labelStyle={{ color: 'var(--on-surface-variant)' }}
                    />
                    <Bar dataKey="revenue" radius={[6, 6, 0, 0]} maxBarSize={64}>
                      {branchRevenue.map((b, i) => (
                        <Cell key={b.branchId} fill={BRANCH_COLORS[i % BRANCH_COLORS.length]} />
                      ))}
                    </Bar>
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Recent Repair Tickets</CardTitle>
              <Link href="/repairs" className="text-sm font-medium text-primary transition-colors hover:text-primary-dim">
                View all
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="divide-y divide-outline-variant">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-4">
                      <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-surface-container" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-surface-container" />
                        <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-container" />
                      </div>
                      <div className="h-6 w-20 animate-pulse rounded-full bg-surface-container" />
                    </div>
                  ))}
                </div>
              ) : recentRepairs.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-on-surface-variant">No repair tickets yet.</p>
              ) : (
                <div className="max-h-[460px] overflow-y-auto divide-y divide-outline-variant">
                  {recentRepairs.map((r) => (
                    <Link
                      key={r.id}
                      href={`/repairs/${r.id}`}
                      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-container-low"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-container">
                        <Smartphone className="h-[18px] w-[18px] text-on-surface-variant" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] text-on-surface">
                          <span className="font-medium">{r.device}</span>
                          <span className="text-on-surface-variant"> · #{r.job_number}</span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-on-surface-variant">
                          {r.customer_name}{r.issue ? ` — ${r.issue}` : ''}
                        </p>
                      </div>
                      <RepairStatusBadge status={r.status} />
                      <span className="hidden w-14 shrink-0 text-right text-xs text-on-surface-variant sm:block">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Log */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <Link href="/repairs" className="text-sm font-medium text-primary transition-colors hover:text-primary-dim">
                View All
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 px-5 py-3">
                      <div className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-surface-container" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-2 w-24 animate-pulse rounded bg-surface-container" />
                        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-container" />
                        <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-container" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-on-surface-variant">No activity yet.</p>
              ) : (
                <div className="max-h-[460px] overflow-y-auto py-2">
                  {recentActivity.map((a) => {
                    const meta = ACTIVITY_META[a.status] ?? { label: a.status, dot: 'bg-slate-400' }
                    return (
                      <Link
                        key={a.id}
                        href={a.repair_id ? `/repairs/${a.repair_id}` : '#'}
                        className="flex items-start gap-3 px-5 py-2.5 transition-colors hover:bg-surface-container-low"
                      >
                        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-on-surface-variant">
                            {a.created_at ? formatActivityTime(a.created_at) : '—'}
                          </p>
                          <p className="mt-0.5 truncate text-sm text-on-surface">
                            <span className="font-medium">{meta.label}</span>
                            {' · '}{a.device}
                            {a.job_number && <span className="text-on-surface-variant"> #{a.job_number}</span>}
                          </p>
                          {a.changed_by && (
                            <p className="mt-0.5 truncate text-xs text-on-surface-variant">by {a.changed_by}</p>
                          )}
                          {a.note && (
                            <p className="mt-0.5 truncate text-xs italic text-on-surface-variant">&ldquo;{a.note}&rdquo;</p>
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
