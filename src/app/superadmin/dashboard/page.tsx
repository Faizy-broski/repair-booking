import { createAdminClient } from '@/backend/config/supabase'
import { formatCurrency } from '@/lib/utils'
import { Building2, Users, CreditCard, TrendingUp } from 'lucide-react'

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
    { label: 'Total Businesses', value: stats.totalBusinesses ?? 0, icon: Building2, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Active Businesses', value: stats.activeBusinesses ?? 0, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Total Users', value: stats.totalUsers ?? 0, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'MRR', value: formatCurrency(stats.mrr), icon: CreditCard, color: 'text-orange-600', bg: 'bg-orange-50' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SuperAdmin Dashboard</h1>
        <p className="text-sm text-gray-500">Platform-wide overview</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{card.label}</p>
              <div className={`rounded-lg p-2 ${card.bg}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className={`mt-2 text-3xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Recent Businesses</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-400 uppercase">
              <th className="px-5 py-3">Business</th>
              <th className="px-5 py-3">Subdomain</th>
              <th className="px-5 py-3">Plan</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {recentBusinesses.map((biz: any) => (
              <tr key={biz.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{biz.name}</td>
                <td className="px-5 py-3 text-sm text-gray-500 font-mono">{biz.subdomain}</td>
                <td className="px-5 py-3 text-sm text-gray-600">
                  {biz.subscriptions?.[0]?.plans?.name ?? '—'}
                </td>
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    biz.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {biz.is_active ? 'Active' : 'Suspended'}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm text-gray-400">
                  {new Date(biz.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
