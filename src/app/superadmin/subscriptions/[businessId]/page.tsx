'use client'
import { useState, useEffect, useMemo, use } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ArrowLeft, Receipt, Download, ExternalLink,
  RefreshCw, Building2, CreditCard, CheckCircle2,
  AlertCircle, Calendar, Filter, X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SubscriptionRow } from '@/app/api/admin/subscriptions/route'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Invoice {
  id: string
  date: number
  amount: number
  currency: string
  status: string | null
  period_start: number
  period_end: number
  invoice_pdf: string | null
  hosted_invoice_url: string | null
  description: string | null
}

interface StripeSubItem {
  price_id: string
  product_name: string | null
  unit_amount: number | null
  currency: string
  interval: string | null
  quantity: number | null
}

interface StripeSub {
  id: string
  status: string
  created: number
  current_period_start: number | null
  current_period_end: number | null
  cancel_at_period_end: boolean
  canceled_at: number | null
  items: StripeSubItem[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtUnix(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function fmtMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100)
}

function getMonthYear(ts: number) {
  const d = new Date(ts * 1000)
  return { month: d.getMonth(), year: d.getFullYear() }
}

// ── Status badge ───────────────────────────────────────────────────────────────

function InvBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-gray-400 text-xs">—</span>
  const variant =
    status === 'paid'   ? 'success' :
    status === 'open'   ? 'warning' :
    'destructive'
  return (
    <Badge variant={variant as any} className="capitalize text-[11px]">
      {status}
    </Badge>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color, bg,
}: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string; bg: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 flex items-center gap-4">
      <div className={`rounded-lg p-2.5 shrink-0 ${bg}`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        <p className="text-xs font-medium text-gray-600 truncate">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  )
}

function KpiSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 flex items-center gap-4 animate-pulse">
      <div className="h-10 w-10 rounded-lg bg-gray-100 shrink-0" />
      <div className="space-y-1.5 flex-1">
        <div className="h-5 w-20 rounded bg-gray-100" />
        <div className="h-3 w-28 rounded bg-gray-100" />
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function BusinessInvoicesPage({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  const { businessId } = use(params)
  const queryClient = useQueryClient()

  // Filters
  const [filterYear, setFilterYear]   = useState<string>('all')
  const [filterMonth, setFilterMonth] = useState<string>('all')
  const [filterDate, setFilterDate]   = useState<string>('')

  const { data: subData } = useQuery({
    queryKey: ['superadmin-subscriptions', 1, 500, '', ''],
    queryFn: async () => {
      const res = await fetch(`/api/admin/subscriptions?page=1&limit=500`)
      if (!res.ok) throw new Error('Failed to load subscription info')
      return res.json()
    },
    staleTime: 2 * 60 * 1000,
  })

  const { data: invData, isLoading, isError, error: invError, refetch, isFetching } = useQuery({
    queryKey: ['superadmin-invoices', businessId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/subscriptions/${businessId}/invoices`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load invoices')
      return json
    },
    staleTime: 2 * 60 * 1000,
  })

  const { data: stripeSubData, isError: stripeSubIsError, error: stripeSubErrorObj } = useQuery({
    queryKey: ['superadmin-stripe-subs', businessId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/subscriptions/${businessId}/stripe-subscriptions`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load Stripe subscriptions')
      return json
    },
    staleTime: 60 * 1000,
  })
  const stripeSubs: StripeSub[] = stripeSubData?.data ?? []
  const activeStripeSubs = stripeSubs.filter((s) => s.status === 'active' || s.status === 'trialing')
  const stripeSubError = stripeSubIsError ? (stripeSubErrorObj as Error)?.message ?? 'Failed to load Stripe subscriptions' : null

  const business: SubscriptionRow | null =
    (subData?.data ?? []).find((r: SubscriptionRow) => r.business_id === businessId) ?? null
  const invoices: Invoice[]  = invData?.data ?? []
  const loading    = isLoading
  const refreshing = isFetching && !isLoading
  const error      = isError ? (invError as Error)?.message ?? 'Failed to load invoices' : null

  // ── Available years / months from actual invoice dates ──────────────────────
  const availableYears = useMemo(() => {
    const years = [...new Set(invoices.map((inv) => getMonthYear(inv.date).year))].sort((a, b) => b - a)
    return years
  }, [invoices])

  const availableMonths = useMemo(() => {
    if (filterYear === 'all') return []
    const yr = parseInt(filterYear, 10)
    const months = [...new Set(
      invoices
        .filter((inv) => getMonthYear(inv.date).year === yr)
        .map((inv) => getMonthYear(inv.date).month)
    )].sort((a, b) => b - a)
    return months
  }, [invoices, filterYear])

  // Reset month+date when year changes
  useEffect(() => { setFilterMonth('all'); setFilterDate('') }, [filterYear])
  // Reset date when month changes
  useEffect(() => { setFilterDate('') }, [filterMonth])

  // ── Available days within selected year+month ───────────────────────────────
  const availableDays = useMemo(() => {
    if (filterYear === 'all' || filterMonth === 'all') return []
    const yr = parseInt(filterYear, 10)
    const mo = parseInt(filterMonth, 10)
    const days = [...new Set(
      invoices
        .filter((inv) => {
          const d = new Date(inv.date * 1000)
          return d.getFullYear() === yr && d.getMonth() === mo
        })
        .map((inv) => new Date(inv.date * 1000).getDate())
    )].sort((a, b) => a - b)
    return days
  }, [invoices, filterYear, filterMonth])

  // ── Filtered invoices ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const d = new Date(inv.date * 1000)
      const year = d.getFullYear(), month = d.getMonth(), day = d.getDate()
      if (filterYear !== 'all' && year !== parseInt(filterYear, 10)) return false
      if (filterMonth !== 'all' && month !== parseInt(filterMonth, 10)) return false
      if (filterDate !== '' && day !== parseInt(filterDate, 10)) return false
      return true
    })
  }, [invoices, filterYear, filterMonth, filterDate])

  // ── KPIs from filtered invoices ─────────────────────────────────────────────
  const totalPaid = useMemo(
    () => filtered.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0),
    [filtered]
  )
  const paidCount    = filtered.filter((i) => i.status === 'paid').length
  const openCount    = filtered.filter((i) => i.status === 'open').length
  const currency     = filtered[0]?.currency ?? 'gbp'

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ]

  // ── Skeleton ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-6 w-48 rounded bg-gray-100 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="h-12 border-b border-gray-100 bg-gray-50 animate-pulse" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 border-b border-gray-50 animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      </div>
    )
  }

  // ── Error ───────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/superadmin/subscriptions" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Subscriptions
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-red-400 mx-auto" />
          <p className="text-sm font-medium text-red-700">{error}</p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <Link
        href="/superadmin/subscriptions"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-700 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Subscriptions
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {business?.business_name ?? businessId}
          </h1>
          <p className="text-sm text-gray-400 font-mono mt-0.5">
            {business?.subdomain}.repairbooking.co.uk
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Business + plan info strip */}
      {business && (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <span className="flex items-center gap-2 text-gray-700">
            <Building2 className="h-4 w-4 text-gray-400" />
            {business.business_name}
          </span>
          <span className="flex items-center gap-2 text-gray-700">
            <CreditCard className="h-4 w-4 text-gray-400" />
            {business.plan_name ?? '—'}
            {business.billing_cycle && (
              <span className="text-gray-400 text-xs">({business.billing_cycle})</span>
            )}
          </span>
          {business.status && (
            <Badge
              variant={
                business.status === 'active'   ? 'success' :
                business.status === 'trialing' ? 'warning' :
                'destructive'
              }
              className="capitalize text-[11px]"
            >
              {business.status.replace('_', ' ')}
            </Badge>
          )}
          {business.stripe_customer_id && (
            <span className="text-gray-400 font-mono text-xs ml-auto">
              {business.stripe_customer_id}
            </span>
          )}
        </div>
      )}

      {/* Stripe subscriptions — read-only diagnostic, flags duplicates */}
      <div className={`rounded-xl border p-5 ${activeStripeSubs.length > 1 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className={`h-4 w-4 ${activeStripeSubs.length > 1 ? 'text-red-600' : 'text-gray-400'}`} />
          <h3 className={`font-semibold ${activeStripeSubs.length > 1 ? 'text-red-800' : 'text-gray-900'}`}>
            Stripe Subscriptions {stripeSubs.length > 0 && `(${stripeSubs.length})`}
          </h3>
          {activeStripeSubs.length > 1 && (
            <Badge variant="destructive" className="text-[11px]">
              {activeStripeSubs.length} active — will all renew and charge separately
            </Badge>
          )}
        </div>
        {stripeSubError ? (
          <p className="text-sm text-red-700 font-medium">Error loading Stripe subscriptions: {stripeSubError}</p>
        ) : stripeSubs.length === 0 ? (
          <p className="text-sm text-gray-400">No Stripe subscriptions found for this customer.</p>
        ) : (
          <div className="space-y-2">
            {stripeSubs.map((sub) => (
              <div
                key={sub.id}
                className={`rounded-lg border px-4 py-3 text-sm ${
                  sub.status === 'active' || sub.status === 'trialing'
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <span className="font-mono text-xs text-gray-500">{sub.id}</span>
                  <Badge
                    variant={sub.status === 'active' ? 'success' : sub.status === 'trialing' ? 'warning' : 'destructive'}
                    className="capitalize text-[11px]"
                  >
                    {sub.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                  {sub.items.map((item, i) => (
                    <span key={i}>
                      {item.quantity ?? 1}× {item.product_name ?? item.price_id}
                      {item.unit_amount != null && ` (${fmtMoney(item.unit_amount, item.currency)}/${item.interval ?? '?'})`}
                    </span>
                  ))}
                </div>
                {sub.current_period_end && (
                  <p className="mt-1 text-xs text-gray-500">
                    Current period: {fmtUnix(sub.current_period_start!)} → {fmtUnix(sub.current_period_end)}
                    {sub.cancel_at_period_end && ' (cancels at period end)'}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Total Paid"
          value={fmtMoney(totalPaid, currency)}
          sub={`${paidCount} paid invoice${paidCount !== 1 ? 's' : ''}`}
          icon={CheckCircle2}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <KpiCard
          label="Total Invoices"
          value={filtered.length}
          sub={`of ${invoices.length} all time`}
          icon={Receipt}
          color="text-teal-600"
          bg="bg-teal-50"
        />
        <KpiCard
          label="Open / Unpaid"
          value={openCount}
          sub={openCount > 0 ? 'requires attention' : 'all settled'}
          icon={openCount > 0 ? AlertCircle : CheckCircle2}
          color={openCount > 0 ? 'text-amber-600' : 'text-emerald-600'}
          bg={openCount > 0 ? 'bg-amber-50' : 'bg-emerald-50'}
        />
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white px-5 py-3 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">
          <Filter className="h-3.5 w-3.5" />
          Filter by
        </span>

        {/* Year */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-400 shrink-0">Year</label>
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="h-8 rounded-lg border border-gray-200 bg-white pl-2.5 pr-7 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors"
          >
            <option value="all">All</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Month — appears once a year is selected */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-400 shrink-0">Month</label>
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            disabled={filterYear === 'all'}
            className="h-8 rounded-lg border border-gray-200 bg-white pl-2.5 pr-7 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <option value="all">All</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>{MONTH_NAMES[m]}</option>
            ))}
          </select>
        </div>

        {/* Day — appears once year + month are selected */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-400 shrink-0">Day</label>
          <select
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            disabled={filterYear === 'all' || filterMonth === 'all'}
            className="h-8 rounded-lg border border-gray-200 bg-white pl-2.5 pr-7 text-sm text-gray-700 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <option value="">All</option>
            {availableDays.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        {/* Clear */}
        {(filterYear !== 'all' || filterMonth !== 'all' || filterDate !== '') && (
          <button
            onClick={() => { setFilterYear('all'); setFilterMonth('all'); setFilterDate('') }}
            className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-700 transition-colors"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Invoice table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-gray-100 p-4 mb-4">
              <Receipt className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">No invoices found</p>
            <p className="text-xs text-gray-400 mt-1">
              {invoices.length > 0
                ? 'Try adjusting the filters above.'
                : 'This business has no Stripe billing history yet.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3.5">#</th>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5">Description</th>
                <th className="px-5 py-3.5">Billing Period</th>
                <th className="px-5 py-3.5 text-right">Amount</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((inv, idx) => (
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                  {/* # */}
                  <td className="px-5 py-4 text-gray-400 text-xs tabular-nums">
                    {filtered.length - idx}
                  </td>

                  {/* Date */}
                  <td className="px-5 py-4 whitespace-nowrap text-gray-700 font-medium">
                    {fmtUnix(inv.date)}
                  </td>

                  {/* Description */}
                  <td className="px-5 py-4 text-gray-600 max-w-[220px]">
                    <p className="truncate" title={inv.description ?? undefined}>
                      {inv.description ?? 'Subscription payment'}
                    </p>
                    <p className="text-[11px] text-gray-400 font-mono">{inv.id}</p>
                  </td>

                  {/* Billing period */}
                  <td className="px-5 py-4 whitespace-nowrap text-gray-500 text-xs">
                    {fmtUnix(inv.period_start)}
                    <span className="mx-1 text-gray-300">→</span>
                    {fmtUnix(inv.period_end)}
                  </td>

                  {/* Amount */}
                  <td className="px-5 py-4 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                    {fmtMoney(inv.amount, inv.currency)}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4">
                    <InvBadge status={inv.status} />
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {inv.invoice_pdf && (
                        <a
                          href={inv.invoice_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 active:bg-teal-800 transition-colors shadow-sm whitespace-nowrap"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      )}
                      {inv.hosted_invoice_url && (
                        <a
                          href={inv.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 active:bg-teal-100 transition-colors whitespace-nowrap"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Footer totals */}
            {filtered.length > 1 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={4} className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Total ({filtered.length} invoices)
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900 tabular-nums">
                    {fmtMoney(filtered.reduce((s, i) => s + i.amount, 0), currency)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  )
}
