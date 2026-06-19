import { createAdminClient } from '@/backend/config/supabase'
import { formatCurrencyCompact } from '@/lib/utils'
import { Building2, Users, CreditCard, TrendingUp, LifeBuoy } from 'lucide-react'
import { StatsCard } from '@/components/dashboard/stats-card'
import Link from 'next/link'

const STATUS_STYLES: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved:    'bg-green-100 text-green-700',
  closed:      'bg-gray-100 text-gray-500',
}
const PRIORITY_STYLES: Record<string, string> = {
  low:    'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

async function getDashboardStats() {
  const supabase = createAdminClient()

  const [
    { count: totalBusinesses },
    { count: activeBusinesses },
    { count: totalUsers },
    { data: subscriptions },
    { count: openTickets },
  ] = await Promise.all([
    supabase.from('businesses').select('*', { count: 'exact', head: true }),
    supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('plan_id, billing_cycle, plans(price_monthly, price_yearly)').eq('status', 'active').eq('livemode', true),
    supabase.from('helpdesk_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
  ])

  const mrr = (subscriptions ?? []).reduce((sum: number, sub: any) => {
    const plan = sub.plans
    if (!plan) return sum
    const amount = sub.billing_cycle === 'yearly'
      ? (plan.price_yearly ?? plan.price_monthly * 12) / 12
      : Number(plan.price_monthly ?? 0)
    return sum + amount
  }, 0)

  return { totalBusinesses, activeBusinesses, totalUsers, mrr, openTickets }
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

async function getRecentTickets() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('helpdesk_tickets')
    .select('id, ticket_number, title, category, status, priority, created_at, businesses(name)')
    .order('created_at', { ascending: false })
    .limit(8)
  return data ?? []
}

export default async function SuperAdminDashboard() {
  const [stats, recentBusinesses, recentTickets] = await Promise.all([
    getDashboardStats(), getRecentBusinesses(), getRecentTickets(),
  ])

  const statCards = [
    { label: 'Total Businesses',  value: stats.totalBusinesses ?? 0,   icon: <Building2 className="h-5 w-5" />, color: 'blue'   as const, subtitle: 'registered' },
    { label: 'Active Businesses', value: stats.activeBusinesses ?? 0,  icon: <TrendingUp className="h-5 w-5" />, color: 'green'  as const, subtitle: 'currently active' },
    { label: 'Total Users',       value: stats.totalUsers ?? 0,        icon: <Users className="h-5 w-5" />,     color: 'purple' as const, subtitle: 'across all tenants' },
    { label: 'MRR',               value: formatCurrencyCompact(stats.mrr, 'GBP'), icon: <CreditCard className="h-5 w-5" />, color: 'yellow' as const, subtitle: 'monthly recurring' },
    { label: 'Open Tickets',      value: stats.openTickets ?? 0,       icon: <LifeBuoy className="h-5 w-5" />, color: 'red'    as const, subtitle: 'awaiting response' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-on-surface">SuperAdmin Dashboard</h1>
        <p className="text-sm text-on-surface-variant">Platform-wide overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Businesses */}
        <div className="rounded-xl border border-outline-variant bg-surface">
          <div className="border-b border-outline-variant px-5 py-4">
            <h2 className="font-semibold text-on-surface">Recent Businesses</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px]">
              <thead>
                <tr className="border-b border-outline-variant text-left text-xs font-medium text-outline uppercase">
                  <th className="px-4 py-3">Business</th>
                  <th className="hidden sm:table-cell px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="hidden sm:table-cell px-4 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {recentBusinesses.map((biz: any) => (
                  <tr key={biz.id} className="hover:bg-surface-container-low">
                    <td className="px-4 py-3">
                      <div className="font-medium text-on-surface text-sm">{biz.name}</div>
                      <div className="text-xs text-on-surface-variant font-mono">{biz.subdomain}</div>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-on-surface-variant">
                      {biz.subscriptions?.[0]?.plans?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        biz.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {biz.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-sm text-outline">
                      {new Date(biz.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Helpdesk Tickets */}
        <div className="rounded-xl border border-outline-variant bg-surface">
          <div className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
            <h2 className="font-semibold text-on-surface">Recent Helpdesk Tickets</h2>
            <Link href="/superadmin/helpdesk" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[380px]">
              <thead>
                <tr className="border-b border-outline-variant text-left text-xs font-medium text-outline uppercase">
                  <th className="px-4 py-3">Ticket</th>
                  <th className="hidden sm:table-cell px-4 py-3">Business</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {recentTickets.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-on-surface-variant">
                      No tickets yet
                    </td>
                  </tr>
                ) : (
                  recentTickets.map((t: any) => (
                    <tr key={t.id} className="hover:bg-surface-container-low">
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs font-semibold text-primary">
                          #{String(t.ticket_number).padStart(8, '0')}
                        </div>
                        <div className="text-sm text-on-surface truncate max-w-[160px]">{t.title}</div>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-sm text-on-surface-variant">
                        {(t.businesses as any)?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[t.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                          {t.priority}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
