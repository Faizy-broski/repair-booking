'use client'
import { useEffect, useState } from 'react'
import { DollarSign, Wrench, Package, ShoppingCart, TrendingUp, AlertTriangle } from 'lucide-react'
import { StatsCard } from '@/components/dashboard/stats-card'
import { useAuthStore } from '@/store/auth.store'
import { formatCurrency } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DashboardStats {
  total_sales: number
  sales_count: number
  repairs_open: number
  repairs_completed: number
  total_expenses: number
  low_stock_count: number
}

interface BranchRevenue {
  branchId: string
  branchName: string
  total: number
}

export default function DashboardPage() {
  const { profile, activeBranch, isOwner } = useAuthStore()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [branchRevenue, setBranchRevenue] = useState<BranchRevenue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeBranch) return

    async function load() {
      setLoading(true)
      const params = new URLSearchParams({
        branch_id: activeBranch!.id,
      })
      const res = await fetch(`/api/dashboard?${params}`)
      const json = await res.json()

      if (json.data) {
        setStats(json.data.stats ?? null)
        setBranchRevenue(json.data.branchRevenue ?? [])
      }
      setLoading(false)
    }

    load()
  }, [activeBranch])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {isOwner() ? 'Business Overview' : `${activeBranch?.name ?? ''} Dashboard`}
        </h1>
        <p className="text-sm text-gray-500">Last 30 days</p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatsCard
            title="Total Sales"
            value={formatCurrency(stats.total_sales)}
            subtitle="this month"
            icon={<DollarSign className="h-5 w-5" />}
            color="green"
          />
          <StatsCard
            title="Transactions"
            value={stats.sales_count}
            subtitle="this month"
            icon={<ShoppingCart className="h-5 w-5" />}
            color="blue"
          />
          <StatsCard
            title="Open Repairs"
            value={stats.repairs_open}
            icon={<Wrench className="h-5 w-5" />}
            color="yellow"
          />
          <StatsCard
            title="Completed Repairs"
            value={stats.repairs_completed}
            subtitle="this month"
            icon={<Wrench className="h-5 w-5" />}
            color="green"
          />
          <StatsCard
            title="Total Expenses"
            value={formatCurrency(stats.total_expenses)}
            subtitle="this month"
            icon={<TrendingUp className="h-5 w-5" />}
            color="red"
          />
          <StatsCard
            title="Low Stock"
            value={stats.low_stock_count}
            subtitle="items"
            icon={<AlertTriangle className="h-5 w-5" />}
            color={stats.low_stock_count > 0 ? 'red' : 'green'}
          />
        </div>
      )}

      {/* Owner: Revenue by Branch */}
      {isOwner() && branchRevenue.length > 0 && !loading && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Branch</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={branchRevenue.map((b) => ({ name: b.branchName, revenue: b.total }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatCurrency(v as number)} />
                  <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      )}
    </div>
  )
}
