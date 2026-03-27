import { createAdminClient } from '@/backend/config/supabase'
import { formatCurrency } from '@/lib/utils'
import {
  TrendingUp, TrendingDown, Building2, CreditCard,
  Users, BarChart3, Activity, AlertCircle,
} from 'lucide-react'
import { AnalyticsCharts } from './charts'

// ─── Types ────────────────────────────────────────────────────────────────
interface MonthBucket { month: string; count: number }
interface PlanStat { name: string; subscribers: number; mrr: number; pct: number }
interface StatusStat { status: string; count: number; pct: number }
interface MrrBucket { month: string; mrr: number }

// ─── Data fetching ────────────────────────────────────────────────────────
async function fetchAnalyticsData() {
  const supabase = createAdminClient()

  const [
    { data: businesses },
    { data: subscriptions },
    { data: plans },
    { count: totalUsers },
  ] = await Promise.all([
    supabase
      .from('businesses')
      .select('id, created_at, is_active')
      .order('created_at', { ascending: true }),
    supabase
      .from('subscriptions')
      .select('id, status, billing_cycle, created_at, current_period_start, plan_id, plans(id, name, price_monthly, price_yearly)')
      .order('created_at', { ascending: true }),
    supabase
      .from('plans')
      .select('id, name, price_monthly, price_yearly, is_active'),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true }),
  ])

  const allBusinesses = businesses ?? []
  const allSubs = subscriptions ?? []
  const allPlans = plans ?? []

  // ── MRR / ARR ──────────────────────────────────────────────────────────
  const activeSubs = allSubs.filter((s) => s.status === 'active' || s.status === 'trialing')
  const mrr = activeSubs.reduce((sum, sub) => {
    const plan = sub.plans as any
    if (!plan) return sum
    return sum + (sub.billing_cycle === 'monthly' ? plan.price_monthly : plan.price_yearly / 12)
  }, 0)
  const arr = mrr * 12

  // ── Monthly signups (last 12 months) ──────────────────────────────────
  const now = new Date()
  const months: MonthBucket[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleString('default', { month: 'short', year: '2-digit' })
    const count = allBusinesses.filter((b) => {
      const cd = new Date(b.created_at)
      return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth()
    }).length
    months.push({ month: label, count })
  }

  // ── MRR by month (last 12 months, approximated by subs created) ────────
  const mrrByMonth: MrrBucket[] = months.map(({ month }, idx) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1)
    const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    // Count subs that were active during this month
    const mrrVal = allSubs
      .filter((s) => {
        const created = new Date(s.created_at)
        return created < nextD && (s.status === 'active' || s.status === 'trialing')
      })
      .reduce((sum, sub) => {
        const plan = sub.plans as any
        if (!plan) return sum
        return sum + (sub.billing_cycle === 'monthly' ? plan.price_monthly : plan.price_yearly / 12)
      }, 0)
    return { month, mrr: Math.round(mrrVal) }
  })

  // ── Subscription status breakdown ─────────────────────────────────────
  const statusCounts: Record<string, number> = {}
  allSubs.forEach((s) => {
    statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1
  })
  const totalSubs = allSubs.length || 1
  const statusStats: StatusStat[] = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
    pct: Math.round((count / totalSubs) * 100),
  })).sort((a, b) => b.count - a.count)

  // ── Plan distribution ─────────────────────────────────────────────────
  const planMap: Record<string, { name: string; subscribers: number; mrr: number }> = {}
  activeSubs.forEach((sub) => {
    const plan = sub.plans as any
    if (!plan) return
    if (!planMap[plan.id]) planMap[plan.id] = { name: plan.name, subscribers: 0, mrr: 0 }
    planMap[plan.id].subscribers++
    planMap[plan.id].mrr += sub.billing_cycle === 'monthly' ? plan.price_monthly : plan.price_yearly / 12
  })
  const totalActiveSubs = activeSubs.length || 1
  const planStats: PlanStat[] = Object.values(planMap)
    .map((p) => ({ ...p, mrr: Math.round(p.mrr), pct: Math.round((p.subscribers / totalActiveSubs) * 100) }))
    .sort((a, b) => b.subscribers - a.subscribers)

  // Add plans with 0 subscribers
  allPlans.forEach((plan) => {
    if (!planMap[plan.id]) {
      planStats.push({ name: plan.name, subscribers: 0, mrr: 0, pct: 0 })
    }
  })

  // ── KPIs ──────────────────────────────────────────────────────────────
  const totalBusinesses = allBusinesses.length
  const activeBusinesses = allBusinesses.filter((b) => b.is_active).length
  const churnedSubs = allSubs.filter((s) => s.status === 'canceled').length
  const avgRevPerBusiness = activeBusinesses > 0 ? mrr / activeBusinesses : 0
  const trialCount = allSubs.filter((s) => s.status === 'trialing').length
  const trialConversionRate =
    allSubs.filter((s) => s.status === 'active').length /
    Math.max(allSubs.filter((s) => s.status === 'active' || s.status === 'canceled' || s.status === 'trialing').length, 1)

  return {
    mrr, arr, totalBusinesses, activeBusinesses,
    totalUsers: totalUsers ?? 0,
    churnedSubs, avgRevPerBusiness, trialCount,
    trialConversionRate: Math.round(trialConversionRate * 100),
    months, mrrByMonth, statusStats, planStats,
  }
}

// ─── Status colour map ────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  active:    'bg-emerald-100 text-emerald-700',
  trialing:  'bg-blue-100 text-blue-700',
  past_due:  'bg-amber-100 text-amber-700',
  canceled:  'bg-red-100 text-red-700',
  suspended: 'bg-gray-100 text-gray-700',
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default async function AnalyticsPage() {
  const data = await fetchAnalyticsData()

  const kpis = [
    {
      label: 'Monthly Recurring Revenue',
      value: formatCurrency(data.mrr),
      sub: `${formatCurrency(data.arr)} ARR`,
      icon: CreditCard,
      color: 'text-brand-teal',
      bg: 'bg-brand-teal-light',
      trend: null,
    },
    {
      label: 'Active Businesses',
      value: data.activeBusinesses,
      sub: `${data.totalBusinesses} total`,
      icon: Building2,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      trend: null,
    },
    {
      label: 'Total Users',
      value: data.totalUsers,
      sub: `across all businesses`,
      icon: Users,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      trend: null,
    },
    {
      label: 'Avg Rev / Business',
      value: formatCurrency(data.avgRevPerBusiness),
      sub: `per active business`,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      trend: null,
    },
    {
      label: 'Trial Conversion',
      value: `${data.trialConversionRate}%`,
      sub: `${data.trialCount} currently trialing`,
      icon: Activity,
      color: 'text-brand-yellow-dark',
      bg: 'bg-brand-yellow-light',
      trend: data.trialConversionRate >= 50 ? 'up' : 'down',
    },
    {
      label: 'Churned Subscriptions',
      value: data.churnedSubs,
      sub: `total cancellations`,
      icon: AlertCircle,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      trend: 'down',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Analytics</h1>
        <p className="text-sm text-gray-500">Revenue, growth and subscription metrics across all tenants</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div className={`rounded-lg p-2 ${kpi.bg}`}>
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
              {kpi.trend === 'up' && <TrendingUp className="h-4 w-4 text-emerald-500" />}
              {kpi.trend === 'down' && kpi.label !== 'Churned Subscriptions' && (
                <TrendingDown className="h-4 w-4 text-rose-500" />
              )}
            </div>
            <p className={`mt-3 text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="mt-0.5 text-sm font-medium text-gray-700">{kpi.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts — client component */}
      <AnalyticsCharts
        mrrByMonth={data.mrrByMonth}
        signupsByMonth={data.months}
        statusStats={data.statusStats}
        planStats={data.planStats}
      />

      {/* Subscription Status Breakdown */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Subscription Status</h2>
          <p className="text-xs text-gray-400 mt-0.5">Distribution of all subscriptions by status</p>
        </div>
        <div className="p-5 space-y-3">
          {data.statusStats.map(({ status, count, pct }) => (
            <div key={status}>
              <div className="flex items-center justify-between text-sm mb-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {status.replace('_', ' ')}
                  </span>
                </div>
                <span className="font-semibold text-gray-700">{count} <span className="font-normal text-gray-400">({pct}%)</span></span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    status === 'active'    ? 'bg-emerald-500' :
                    status === 'trialing'  ? 'bg-blue-500' :
                    status === 'past_due'  ? 'bg-amber-500' :
                    status === 'canceled'  ? 'bg-rose-500' : 'bg-gray-400'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plan Distribution Table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Plan Distribution</h2>
          <p className="text-xs text-gray-400 mt-0.5">Active + trialing subscriptions per plan</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
              <th className="px-5 py-3">Plan</th>
              <th className="px-5 py-3 text-right">Subscribers</th>
              <th className="px-5 py-3 text-right">MRR contribution</th>
              <th className="px-5 py-3 text-right">% of MRR</th>
              <th className="px-5 py-3">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.planStats.map((plan) => (
              <tr key={plan.name} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{plan.name}</td>
                <td className="px-5 py-3 text-right text-sm text-gray-600 tabular-nums">{plan.subscribers}</td>
                <td className="px-5 py-3 text-right text-sm font-medium text-brand-teal tabular-nums">
                  {formatCurrency(plan.mrr)}
                </td>
                <td className="px-5 py-3 text-right text-sm text-gray-500 tabular-nums">{plan.pct}%</td>
                <td className="px-5 py-3 w-40">
                  <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-teal"
                      style={{ width: `${plan.pct}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {data.planStats.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">
                  No subscription data yet
                </td>
              </tr>
            )}
          </tbody>
          {data.planStats.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td className="px-5 py-3 text-sm font-semibold text-gray-700">Total</td>
                <td className="px-5 py-3 text-right text-sm font-semibold text-gray-700 tabular-nums">
                  {data.planStats.reduce((s, p) => s + p.subscribers, 0)}
                </td>
                <td className="px-5 py-3 text-right text-sm font-semibold text-brand-teal tabular-nums">
                  {formatCurrency(data.mrr)}
                </td>
                <td className="px-5 py-3 text-right text-sm text-gray-400">100%</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
