'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search, X, Receipt, TrendingUp, CheckCircle2, Clock,
  AlertCircle, XCircle, RefreshCw, Pencil, TriangleAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/shared/data-table'
import type { ColumnDef } from '@tanstack/react-table'
import type { SubscriptionRow } from '@/app/api/admin/subscriptions/route'

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtMRR(row: SubscriptionRow) {
  const price =
    row.billing_cycle === 'yearly'
      ? (row.plan_price_yearly ?? 0) / 12
      : (row.plan_price_monthly ?? 0)
  if (!price) return '—'
  return `£${price.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo`
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

// ── Status badge ───────────────────────────────────────────────────────────────

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

// ── Plan type ──────────────────────────────────────────────────────────────────

interface PlanOption {
  id: string
  name: string
  price_monthly: number
  price_yearly: number
  is_active: boolean
}

// ── Edit subscription modal ────────────────────────────────────────────────────

const STATUSES = [
  { value: 'active',    label: 'Active' },
  { value: 'trialing',  label: 'Trialing' },
  { value: 'past_due',  label: 'Past Due' },
  { value: 'canceled',  label: 'Canceled' },
  { value: 'suspended', label: 'Suspended' },
] as const

type EditStatus = typeof STATUSES[number]['value']

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

function EditSubscriptionModal({
  row,
  plans,
  onClose,
  onSaved,
}: {
  row: SubscriptionRow
  plans: PlanOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const [planId, setPlanId]                 = useState(row.plan_id ?? '')
  const [status, setStatus]                 = useState<EditStatus>((row.status as EditStatus) ?? 'active')
  const [billingCycle, setBillingCycle]     = useState<'monthly' | 'yearly'>((row.billing_cycle as any) ?? 'monthly')
  const [periodEnd, setPeriodEnd]           = useState(toDateInput(row.current_period_end))
  const [trialEndsAt, setTrialEndsAt]       = useState(toDateInput(row.trial_ends_at))
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  // Trap focus inside modal and handle Escape key
  const modalRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null
    modalRef.current?.focus()
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prevFocus?.focus()
    }
  }, [onClose])

  async function handleSave() {
    if (!planId) { setError('Please select a plan'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/subscriptions/${row.business_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          status,
          billingCycle,
          currentPeriodEnd: periodEnd || null,
          trialEndsAt:      status === 'trialing' ? (trialEndsAt || null) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save')
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedPlan = plans.find((p) => p.id === planId)
  const willDeactivate = status === 'canceled' || status === 'suspended'

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Dialog */}
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit subscription — ${row.business_name}`}
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Subscription</h2>
            <p className="mt-0.5 text-sm text-gray-500 font-mono">{row.business_name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {/* Plan */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Plan</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-colors"
            >
              <option value="">Select a plan…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {!p.is_active ? ' (inactive)' : ''}
                  {' — '}
                  £{p.price_monthly}/mo · £{p.price_yearly}/yr
                </option>
              ))}
            </select>
            {selectedPlan && (
              <p className="text-xs text-gray-400">
                Monthly: £{selectedPlan.price_monthly} · Yearly: £{selectedPlan.price_yearly}
                {billingCycle === 'yearly' && selectedPlan.price_yearly > 0 && (
                  <span className="ml-1 text-emerald-600">
                    (£{(selectedPlan.price_yearly / 12).toFixed(0)}/mo equiv.)
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Status</label>
            <div className="grid grid-cols-5 gap-1.5">
              {STATUSES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatus(value)}
                  className={`rounded-lg py-2 text-xs font-medium transition-colors border ${
                    status === value
                      ? value === 'active'    ? 'bg-emerald-600 text-white border-emerald-600'
                      : value === 'trialing'  ? 'bg-blue-600 text-white border-blue-600'
                      : value === 'past_due'  ? 'bg-amber-500 text-white border-amber-500'
                      : value === 'canceled'  ? 'bg-rose-600 text-white border-rose-600'
                      :                         'bg-gray-600 text-white border-gray-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Billing cycle */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Billing Cycle</label>
            <div className="flex gap-2">
              {(['monthly', 'yearly'] as const).map((cycle) => (
                <button
                  key={cycle}
                  type="button"
                  onClick={() => setBillingCycle(cycle)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors capitalize ${
                    billingCycle === cycle
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {cycle}
                </button>
              ))}
            </div>
          </div>

          {/* Period End */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Current Period End
              <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-colors"
            />
          </div>

          {/* Trial Ends — only when trialing */}
          {status === 'trialing' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">
                Trial Ends At
                <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="date"
                value={trialEndsAt}
                onChange={(e) => setTrialEndsAt(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-colors"
              />
            </div>
          )}

          {/* Deactivation warning */}
          {willDeactivate && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <TriangleAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                Setting status to <strong>{status}</strong> will mark this business as
                inactive. Their tenant portal will show an access-denied screen until
                reactivated.
              </p>
            </div>
          )}

          {/* Stripe note */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              <strong className="text-gray-700">Note:</strong> Changes are applied to
              your platform only. Stripe billing is <em>not</em> modified. If this
              business has an active Stripe subscription, manage it separately in the
              Stripe dashboard.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !planId}
            className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-700 active:bg-teal-800 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const queryClient = useQueryClient()
  const [page, setPage]         = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState('')
  const [syncing, setSyncing]   = useState(false)
  const [syncResult, setSyncResult] = useState<{ live: number; test: number } | null>(null)
  const [editRow, setEditRow]   = useState<SubscriptionRow | null>(null)

  // Plans — fetched once and cached; used by the edit modal
  const { data: plansData } = useQuery({
    queryKey: ['superadmin-plans'],
    queryFn: async () => {
      const res = await fetch('/api/plans?all=true')
      if (!res.ok) throw new Error('Failed to load plans')
      return res.json()
    },
    staleTime: 10 * 60 * 1000,
  })
  const plans: PlanOption[] = plansData?.data ?? []

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
        // Invalidate all subscription queries so stats refresh
        queryClient.invalidateQueries({ queryKey: ['superadmin-subscriptions'] })
      }
    } finally {
      setSyncing(false)
    }
  }

  const columns: ColumnDef<SubscriptionRow>[] = [
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
        const price = row.original.plan_price_monthly
        return name ? (
          <div>
            <p className="text-sm text-gray-700">{name}</p>
            {price != null && (
              <p className="text-xs text-gray-400">
                £{price.toLocaleString('en-GB', { minimumFractionDigits: 0 })}/mo
              </p>
            )}
          </div>
        ) : <span className="text-gray-400 text-sm">—</span>
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => <SubBadge status={getValue() as string | null} />,
    },
    {
      accessorKey: 'billing_cycle',
      header: 'Billing',
      cell: ({ getValue }) => {
        const v = getValue() as string | null
        if (!v) return <span className="text-gray-400 text-sm">—</span>
        return (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
            v === 'yearly' ? 'bg-violet-50 text-violet-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {v === 'yearly' ? 'Yearly' : 'Monthly'}
          </span>
        )
      },
    },
    {
      id: 'period_end',
      header: 'Period End',
      cell: ({ row }) => {
        const date = row.original.current_period_end ?? row.original.trial_ends_at
        if (!date) return <span className="text-gray-400 text-sm">—</span>
        const expired = new Date(date) < new Date()
        return (
          <span className={`text-sm ${expired ? 'text-red-600 font-medium' : 'text-gray-700'}`}>
            {fmtDate(date)}
          </span>
        )
      },
    },
    {
      id: 'mrr',
      header: 'MRR',
      cell: ({ row }) => (
        <span className="text-sm font-medium text-gray-800 tabular-nums">
          {fmtMRR(row.original)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setEditRow(row.original)}
            title="Edit subscription"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <Link
            href={`/superadmin/subscriptions/${row.original.business_id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-600 hover:text-white hover:border-teal-600 transition-colors"
          >
            <Receipt className="h-3.5 w-3.5" />
            Invoices
          </Link>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
          <p className="text-sm text-gray-500">Live Stripe billing only — test-mode data excluded from stats</p>
        </div>
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
        emptyMessage="No subscriptions found."
      />

      {/* Edit subscription modal */}
      {editRow && (
        <EditSubscriptionModal
          row={editRow}
          plans={plans}
          onClose={() => setEditRow(null)}
          onSaved={() => {
            setEditRow(null)
            // Invalidate list so stats and row data refresh
            queryClient.invalidateQueries({ queryKey: ['superadmin-subscriptions'] })
          }}
        />
      )}
    </div>
  )
}
