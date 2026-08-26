'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  Search, X, Receipt, TrendingUp, CheckCircle2, Clock,
  AlertCircle, XCircle, RefreshCw, Landmark, CalendarDays, Building2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import type { ColumnDef } from '@tanstack/react-table'
import type { SubscriptionRow } from '@/app/api/admin/subscriptions/route'
import type { ManualPaymentListRow } from '@/app/api/admin/manual-payments/route'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Stats {
  mrr: number
  active: number
  trialing: number
  past_due: number
  canceled: number
  suspended: number
  total_subscriptions: number
}

interface SubscriptionsResponse {
  data: SubscriptionRow[]
  meta: { page: number; limit: number; total: number }
  stats: Stats
}

interface ManualPaymentStats {
  totalAmount: number
  thisMonthAmount: number
  paymentsCount: number
  businessesCount: number
}

interface ManualPaymentsResponse {
  data: ManualPaymentListRow[]
  meta: { page: number; limit: number; total: number }
  stats: ManualPaymentStats
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtAmount(row: SubscriptionRow) {
  if (row.billing_cycle === 'yearly') {
    const price = row.plan_price_yearly ?? 0
    if (!price) return '—'
    return `£${price.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/yr`
  }
  const price = row.plan_price_monthly ?? 0
  if (!price) return '—'
  return `£${price.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo`
}

// Manual payment amounts are stored in pounds (NUMERIC), unlike Stripe's pence-based plan prices
function fmtGBP(amount: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

async function fetchSubscriptions(params: {
  page: number; pageSize: number; search: string; status: string
}): Promise<SubscriptionsResponse> {
  const p = new URLSearchParams({ page: String(params.page + 1), limit: String(params.pageSize) })
  if (params.search) p.set('search', params.search)
  if (params.status) p.set('status', params.status)
  const res = await fetch(`/api/admin/subscriptions?${p}`)
  if (!res.ok) throw new Error('Failed to load subscriptions')
  return res.json()
}

async function fetchManualPayments(params: {
  page: number; pageSize: number; search: string
}): Promise<ManualPaymentsResponse> {
  const p = new URLSearchParams({ page: String(params.page + 1), limit: String(params.pageSize) })
  if (params.search) p.set('search', params.search)
  const res = await fetch(`/api/admin/manual-payments?${p}`)
  if (!res.ok) throw new Error('Failed to load manual payments')
  return res.json()
}

// ── Status badge ───────────────────────────────────────────────────────────────

// Color-codes the payment method instead of a flat gray badge for every type
function methodBadgeVariant(method: string): 'default' | 'success' | 'purple' | 'secondary' {
  if (method === 'bank_transfer') return 'default'
  if (method === 'cash')          return 'success'
  if (method === 'cheque')        return 'purple'
  return 'secondary'
}

function SubBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400 text-sm">—</span>
  const variant =
    status === 'active'   ? 'success' :
    status === 'trialing' ? 'warning' :
    status === 'past_due' ? 'warning' :
    'destructive'
  return (
    <Badge variant={variant as any} className="text-[10px] capitalize">
      {status.replace('_', ' ')}
    </Badge>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string; bg: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className={`rounded-lg p-2 w-fit ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className={`mt-3 text-2xl font-bold ${color}`}>{value}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-700">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function StatSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse">
      <div className="h-8 w-8 rounded-lg bg-gray-100" />
      <div className="mt-3 h-7 w-24 rounded bg-gray-100" />
      <div className="mt-1 h-4 w-32 rounded bg-gray-100" />
    </div>
  )
}

// ── Status filter pills ────────────────────────────────────────────────────────

const STATUS_PILLS = [
  { value: '',          label: 'All' },
  { value: 'active',    label: 'Active' },
  { value: 'trialing',  label: 'Trialing' },
  { value: 'past_due',  label: 'Past Due' },
  { value: 'canceled',  label: 'Canceled' },
  { value: 'suspended', label: 'Suspended' },
]

// ── Stripe tab ─────────────────────────────────────────────────────────────────

function StripeTransactionsTab() {
  const [page, setPage]         = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState('')
  const [syncing, setSyncing]   = useState(false)
  const [syncResult, setSyncResult] = useState<{ live: number; test: number } | null>(null)

  const queryKey = ['superadmin-subscriptions', page, pageSize, search, status]

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: () => fetchSubscriptions({ page, pageSize, search, status }),
    // Keep previous page data visible while fetching next page (no flicker)
    placeholderData: (prev) => prev,
    staleTime: 2 * 60 * 1000,  // 2 min — billing data changes infrequently
  })

  const rows  = data?.data  ?? []
  const total = data?.meta?.total ?? 0
  const stats = data?.stats ?? null

  async function syncLiveMode() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res  = await fetch('/api/admin/subscriptions/sync-live', { method: 'POST' })
      const json = await res.json()
      if (json.ok) {
        setSyncResult({ live: json.live, test: json.test })
        // Re-fetch by bumping the query
        setPage(0)
      }
    } finally {
      setSyncing(false)
    }
  }

  const columns: ColumnDef<SubscriptionRow>[] = [
    {
      id: 'date',
      header: 'Date',
      cell: ({ row }) => {
        const date = row.original.current_period_end ?? row.original.trial_ends_at
        if (!date) return <span className="text-gray-400 text-sm">—</span>
        return <span className="text-sm font-medium text-gray-700 whitespace-nowrap">{fmtDate(date)}</span>
      },
    },
    {
      accessorKey: 'business_name',
      header: 'Business',
      cell: ({ getValue, row }) => (
        <div>
          <Link
            href={`/superadmin/businesses/${row.original.business_id}`}
            className="font-medium text-teal-700 hover:text-teal-900 hover:underline"
          >
            {getValue() as string}
          </Link>
          <p className="text-xs text-gray-400 font-mono">{row.original.subdomain}.repairbooking.co.uk</p>
        </div>
      ),
    },
    {
      accessorKey: 'plan_name',
      header: 'Plan',
      cell: ({ getValue, row }) => {
        const name  = getValue() as string | null
        const cycle = row.original.billing_cycle
        return name ? (
          <div>
            <p className="text-sm text-gray-700">{name}</p>
            {cycle && (
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                cycle === 'yearly' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {cycle === 'yearly' ? 'Yearly' : 'Monthly'}
              </span>
            )}
          </div>
        ) : <span className="text-gray-400 text-sm">—</span>
      },
    },
    {
      id: 'amount',
      header: 'Amount',
      cell: ({ row }) => (
        <span className="text-sm font-semibold tabular-nums text-emerald-700">
          {fmtAmount(row.original)}
        </span>
      ),
    },
    {
      id: 'period',
      header: 'Period',
      cell: ({ row }) => {
        const date = row.original.current_period_end ?? row.original.trial_ends_at
        if (!date) return <span className="text-gray-400 text-sm">—</span>
        const expired = new Date(date) < new Date()
        return (
          <span className={`text-xs whitespace-nowrap ${expired ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
            Until {fmtDate(date)}
          </span>
        )
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => <SubBadge status={getValue() as string | null} />,
    },
    {
      id: 'invoice',
      header: 'Invoice',
      cell: ({ row }) => (
        <Link
          href={`/superadmin/subscriptions/${row.original.business_id}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-600 hover:text-white hover:border-teal-600 transition-colors whitespace-nowrap"
        >
          <Receipt className="h-3.5 w-3.5" />
          View
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-500">Active subscriptions — live Stripe billing only</p>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={syncLiveMode}
            disabled={syncing}
            title="Check each subscription against Stripe to detect live vs test mode"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing…' : 'Sync Live Mode'}
          </button>
          {syncResult && (
            <p className="text-xs text-gray-500">
              Synced: <span className="text-emerald-600 font-medium">{syncResult.live} live</span>
              {' · '}
              <span className="text-gray-400">{syncResult.test} test</span>
            </p>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {!stats ? (
          Array.from({ length: 5 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Monthly Recurring Revenue" value={`£${stats.mrr.toLocaleString('en-GB')}`} sub={`£${(stats.mrr * 12).toLocaleString('en-GB')} ARR`} icon={TrendingUp} color="text-brand-teal" bg="bg-brand-teal-light" />
            <StatCard label="Active" value={stats.active} sub={`${stats.total_subscriptions} total`} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50" />
            <StatCard label="Trialing" value={stats.trialing} sub="on free trial" icon={Clock} color="text-blue-600" bg="bg-blue-50" />
            <StatCard label="Past Due" value={stats.past_due} sub="payment failed" icon={AlertCircle} color="text-amber-600" bg="bg-amber-50" />
            <StatCard label="Canceled / Suspended" value={stats.canceled + stats.suspended} sub="churned" icon={XCircle} color="text-rose-600" bg="bg-rose-50" />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs w-full sm:w-auto">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search businesses..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(0) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_PILLS.map((pill) => (
            <button
              key={pill.value}
              onClick={() => { setStatus(pill.value); setPage(0) }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                status === pill.value ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
        {isFetching && !isLoading && (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-gray-400 ml-auto" />
        )}
      </div>

      {/* Table */}
      <DataTable
        data={rows}
        columns={columns}
        isLoading={isLoading}
        totalCount={total}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
        emptyMessage="No transactions found."
      />
    </div>
  )
}

// ── Manual payments tab ────────────────────────────────────────────────────────

function ManualPaymentsTab() {
  const [page, setPage]         = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch]     = useState('')

  const queryKey = ['superadmin-manual-payments-list', page, pageSize, search]

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchManualPayments({ page, pageSize, search }),
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000,
  })

  const rows  = data?.data  ?? []
  const total = data?.meta?.total ?? 0
  const stats = data?.stats ?? null

  const columns: ColumnDef<ManualPaymentListRow>[] = [
    {
      id: 'date',
      header: 'Date',
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-700 whitespace-nowrap">{fmtDate(row.original.paid_at)}</span>
      ),
    },
    {
      accessorKey: 'business_name',
      header: 'Business',
      cell: ({ getValue, row }) => (
        <div>
          <Link
            href={`/superadmin/businesses/${row.original.business_id}`}
            className="font-medium text-teal-700 hover:text-teal-900 hover:underline"
          >
            {getValue() as string}
          </Link>
          <p className="text-xs text-gray-400 font-mono">{row.original.subdomain}.repairbooking.co.uk</p>
        </div>
      ),
    },
    {
      accessorKey: 'plan_name',
      header: 'Plan',
      cell: ({ getValue, row }) => {
        const name  = getValue() as string | null
        const cycle = row.original.billing_cycle
        return name ? (
          <div>
            <p className="text-sm text-gray-700">{name}</p>
            {cycle && (
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                cycle === 'yearly' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {cycle === 'yearly' ? 'Yearly' : 'Monthly'}
              </span>
            )}
          </div>
        ) : <span className="text-gray-400 text-sm">—</span>
      },
    },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: ({ getValue }) => {
        const method = getValue() as string
        return (
          <Badge variant={methodBadgeVariant(method)} className="capitalize text-[10px]">
            {method.replace('_', ' ')}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ getValue }) => {
        const ref = getValue() as string | null
        return ref
          ? <span className="text-sm text-gray-600 max-w-[160px] truncate block" title={ref}>{ref}</span>
          : <span className="text-gray-400 text-sm">—</span>
      },
    },
    {
      id: 'amount',
      header: 'Amount',
      cell: ({ row }) => (
        <span className="text-sm font-semibold tabular-nums text-emerald-700">
          {fmtGBP(row.original.amount)}
        </span>
      ),
    },
    {
      id: 'period',
      header: 'Period Covered',
      cell: ({ row }) => {
        const { period_start, period_end } = row.original
        if (!period_start && !period_end) return <span className="text-gray-400 text-sm">—</span>
        return (
          <span className="text-xs whitespace-nowrap text-gray-500">
            {fmtDate(period_start)} <span className="text-gray-300">→</span> {fmtDate(period_end)}
          </span>
        )
      },
    },
    {
      accessorKey: 'created_by_name',
      header: 'Recorded By',
      cell: ({ getValue }) => (
        <span className="text-xs text-gray-500 whitespace-nowrap">{(getValue() as string | null) ?? '—'}</span>
      ),
    },
    {
      id: 'view',
      header: '',
      cell: ({ row }) => (
        <Link
          href={`/superadmin/subscriptions/${row.original.business_id}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-600 hover:text-white hover:border-teal-600 transition-colors whitespace-nowrap"
        >
          <Receipt className="h-3.5 w-3.5" />
          View
        </Link>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-500">Bank transfer, cash & cheque payments recorded by super admin — not billed through Stripe</p>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!stats ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Total Recorded" value={fmtGBP(stats.totalAmount)} sub="all time" icon={Landmark} color="text-brand-teal" bg="bg-brand-teal-light" />
            <StatCard label="This Month" value={fmtGBP(stats.thisMonthAmount)} sub="recorded so far" icon={CalendarDays} color="text-emerald-600" bg="bg-emerald-50" />
            <StatCard label="Businesses Paying Manually" value={stats.businessesCount} sub="distinct businesses" icon={Building2} color="text-blue-600" bg="bg-blue-50" />
            <StatCard label="Payments Recorded" value={stats.paymentsCount} sub="total entries" icon={Receipt} color="text-violet-600" bg="bg-violet-50" />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs w-full sm:w-auto">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search businesses..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-8 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(0) }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <DataTable
        data={rows}
        columns={columns}
        isLoading={isLoading}
        totalCount={total}
        pageIndex={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0) }}
        emptyMessage="No manual payments recorded yet — use Record Payment on a business to add one."
      />
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const [tab, setTab] = useState<'stripe' | 'manual'>('stripe')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <p className="text-sm text-gray-500">Platform billing — Stripe and manually recorded payments</p>
      </div>

      {/* Tab switcher */}
      <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
        <button
          onClick={() => setTab('stripe')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'stripe' ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Receipt className="h-3.5 w-3.5" />
          Stripe Transactions
        </button>
        <button
          onClick={() => setTab('manual')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${
            tab === 'manual' ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Landmark className="h-3.5 w-3.5" />
          Manual Payments
        </button>
      </div>

      {tab === 'stripe' ? <StripeTransactionsTab /> : <ManualPaymentsTab />}
    </div>
  )
}
