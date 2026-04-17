import { createAdminClient } from '@/backend/config/supabase'
import { formatCurrencyCompact } from '@/lib/utils'
import { Building2, Users, CreditCard, TrendingUp } from 'lucide-react'
import { StatsCard } from '@/components/dashboard/stats-card'

async function getDashboardStats() {
  const supabase = createAdminClient()

  const [
    { count: totalBusinesses },
    { count: activeBusinesses },
    { count: totalUsers },
    { data: subscriptions },
  ] = await Promise.all([
    supabase.from('businesses').select('*', { count: 'exact', head: true }),
    supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('plan_id, billing_cycle, plans(price_monthly, price_yearly)').eq('status', 'active'),
  ])

  const mrr = (subscriptions ?? []).reduce((sum: number, sub: any) => {
    const plan = sub.plans
    if (!plan) return sum
    return sum + (sub.billing_cycle === 'monthly' ? plan.price_monthly : plan.price_yearly / 12)
  }, 0)

  return { totalBusinesses, activeBusinesses, totalUsers, mrr }
}

async function getRecentBusinesses() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('businesses')
    .select('id, name, subdomain, is_active, created_at, subscriptions(status, plans(name))')
    .order('created_at', { ascending: false })
    .limit(10)
  return data ?? []
}

export default async function SuperAdminDashboard() {
  const [stats, recentBusinesses] = await Promise.all([getDashboardStats(), getRecentBusinesses()])

  const statCards = [
    { label: 'Total Businesses',  value: stats.totalBusinesses ?? 0,   icon: <Building2 className="h-5 w-5" />, color: 'blue'   as const, subtitle: 'registered' },
    { label: 'Active Businesses', value: stats.activeBusinesses ?? 0,  icon: <TrendingUp className="h-5 w-5" />, color: 'green'  as const, subtitle: 'currently active' },
    { label: 'Total Users',       value: stats.totalUsers ?? 0,        icon: <Users className="h-5 w-5" />,     color: 'purple' as const, subtitle: 'across all tenants' },
    { label: 'MRR',               value: formatCurrencyCompact(stats.mrr, 'USD'), icon: <CreditCard className="h-5 w-5" />, color: 'yellow' as const, subtitle: 'monthly recurring' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-on-surface">SuperAdmin Dashboard</h1>
        <p className="text-sm text-on-surface-variant">Platform-wide overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <StatsCard
            key={card.label}
            title={card.label}
            value={card.value}
            icon={card.icon}
            color={card.color}
            subtitle={card.subtitle}
          />
        ))}
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface">
        <div className="border-b border-outline-variant px-5 py-4">
          <h2 className="font-semibold text-on-surface">Recent Businesses</h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[480px]">
          <thead>
            <tr className="border-b border-outline-variant text-left text-xs font-medium text-outline uppercase">
              <th className="px-4 sm:px-5 py-3">Business</th>
              <th className="hidden sm:table-cell px-5 py-3">Subdomain</th>
              <th className="px-4 sm:px-5 py-3">Plan</th>
              <th className="px-4 sm:px-5 py-3">Status</th>
              <th className="hidden sm:table-cell px-5 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {recentBusinesses.map((biz: any) => (
              <tr key={biz.id} className="hover:bg-surface-container-low">
                <td className="px-4 sm:px-5 py-3 font-medium text-on-surface">{biz.name}</td>
                <td className="hidden sm:table-cell px-5 py-3 text-sm text-on-surface-variant font-mono">{biz.subdomain}</td>
                <td className="px-4 sm:px-5 py-3 text-sm text-on-surface-variant">
                  {biz.subscriptions?.[0]?.plans?.name ?? '—'}
                </td>
                <td className="px-4 sm:px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    biz.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {biz.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="hidden sm:table-cell px-5 py-3 text-sm text-outline">
                  {new Date(biz.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
