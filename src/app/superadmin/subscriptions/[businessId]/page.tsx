'use client'
import { useState, useEffect, useMemo, use } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import {
  ArrowLeft, Receipt, Download, ExternalLink,
  RefreshCw, Building2, CreditCard, CheckCircle2,
  AlertCircle, Calendar, Filter, X, Landmark, Plus, Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { SubscriptionRow } from '@/app/api/admin/subscriptions/route'
import type { ManualPaymentRow } from '@/app/api/admin/subscriptions/[businessId]/manual-payments/route'
import { RecordManualPaymentModal } from '@/components/superadmin/record-manual-payment-modal'
import type { PlanOption } from '@/components/superadmin/edit-subscription-modal'

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

// Manual payment amounts are stored in pounds (NUMERIC), unlike Stripe's pence
function fmtGBP(amount: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: 'GBP', minimumFractionDigits: 2,
  }).format(amount)
}

function fmtDateStr(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Color-codes the payment method instead of a flat gray badge for every type
function methodBadgeVariant(method: string): 'default' | 'success' | 'purple' | 'secondary' {
  if (method === 'bank_transfer') return 'default'
  if (method === 'cash')          return 'success'
  if (method === 'cheque')        return 'purple'
  return 'secondary'
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

  // Fetched directly by id rather than found in the Stripe-livemode-filtered
  // /api/admin/subscriptions list — a business with no live Stripe subscription
  // (e.g. one that only ever pays manually) would never appear in that list,
  // which used to leave this page unable to resolve even the business's name.
  const { data: businessData } = useQuery({
    queryKey: ['superadmin-business-detail', businessId],
    queryFn: async () => {
      const res = await fetch(`/api/businesses/${businessId}`)
      if (!res.ok) throw new Error('Failed to load business info')
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

  const { data: manualData, isFetching: manualFetching } = useQuery({
    queryKey: ['superadmin-manual-payments', businessId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/subscriptions/${businessId}/manual-payments`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load manual payments')
      return json
    },
    staleTime: 60 * 1000,
  })
  const manualPayments: ManualPaymentRow[] = manualData?.data ?? []
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false)
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null)

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

  async function deleteManualPayment(id: string) {
    if (!confirm('Delete this manual payment record?')) return
    setDeletingPaymentId(id)
    try {
      await fetch(`/api/admin/subscriptions/${businessId}/manual-payments/${id}`, { method: 'DELETE' })
      queryClient.invalidateQueries({ queryKey: ['superadmin-manual-payments', businessId] })
    } finally {
      setDeletingPaymentId(null)
    }
  }

  const business: SubscriptionRow | null = useMemo(() => {
    const biz = businessData?.data
    if (!biz) return null
    const sub = (biz.subscriptions ?? [])[0] ?? null
    const plan = sub?.plans ?? null
    return {
      business_id:         biz.id,
      business_name:       biz.name,
      subdomain:           biz.subdomain,
      stripe_customer_id:  biz.stripe_customer_id ?? sub?.stripe_customer_id ?? null,
      subscription_id:     sub?.id ?? null,
      status:              sub?.status ?? null,
      billing_cycle:       sub?.billing_cycle ?? null,
      plan_id:             sub?.plan_id ?? plan?.id ?? null,
      plan_name:           plan?.name ?? null,
      plan_price_monthly:  plan?.price_monthly ?? null,
      plan_price_yearly:   plan?.price_yearly ?? null,
      is_custom:           sub?.is_custom ?? false,
      custom_max_branches: sub?.custom_max_branches ?? null,
      custom_max_users:    sub?.custom_max_users ?? null,
      custom_max_products: sub?.custom_max_products ?? null,
      custom_max_services: sub?.custom_max_services ?? null,
      custom_price_monthly: sub?.custom_price_monthly ?? null,
      current_period_end: sub?.current_period_end ?? null,
      trial_ends_at:       sub?.trial_ends_at ?? null,
      canceled_at:         sub?.canceled_at ?? null,
      is_active:           biz.is_active ?? false,
    }
  }, [businessData])

  const manualPaymentBusiness = business ? {
    id: business.business_id,
    name: business.business_name,
    subscriptions: [{
      status:                business.status ?? 'active',
      billing_cycle:         business.billing_cycle,
      current_period_end:    business.current_period_end,
      trial_ends_at:         business.trial_ends_at,
      plan_id:               business.plan_id,
      is_custom:             business.is_custom,
      custom_price_monthly:  business.custom_price_monthly,
    }],
  } : null
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 text-teal-600 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Business + plan info strip */}
      {business && (
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <span className="flex items-center gap-2 text-gray-800 font-medium">
            <Building2 className="h-4 w-4 text-teal-600" />
            {business.business_name}
          </span>
          <span className="flex items-center gap-2 text-gray-800 font-medium">
            <CreditCard className="h-4 w-4 text-blue-600" />
            {business.plan_name ?? '—'}
            {business.billing_cycle && (
              <span className="text-gray-500 text-xs">({business.billing_cycle})</span>
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
          <div className={`rounded-lg p-1.5 ${activeStripeSubs.length > 1 ? 'bg-red-100' : 'bg-blue-50'}`}>
            <CreditCard className={`h-4 w-4 ${activeStripeSubs.length > 1 ? 'text-red-600' : 'text-blue-600'}`} />
          </div>
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

      {/* Manual payments — bank transfer / cash / cheque, recorded off-Stripe */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-teal-50 p-1.5">
              <Landmark className="h-4 w-4 text-teal-600" />
            </div>
            <h3 className="font-semibold text-gray-900">
              Manual Payments {manualPayments.length > 0 && `(${manualPayments.length})`}
            </h3>
            {manualFetching && <RefreshCw className="h-3.5 w-3.5 animate-spin text-teal-600" />}
          </div>
          <button
            onClick={() => setRecordPaymentOpen(true)}
            disabled={!manualPaymentBusiness}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 active:bg-teal-800 transition-colors shadow-sm disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Record Payment
          </button>
        </div>

        {manualPayments.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            No manual payments recorded — use "Record Payment" for bank transfer, cash, or cheque payments.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-outline-variant/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary">
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">Date</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">Plan</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">Method</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">Reference</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">Period Covered</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wider text-white">Amount</th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">Recorded By</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {manualPayments.map((p, i) => (
                  <tr key={p.id} className={`hover:bg-teal-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-800 font-medium">{fmtDateStr(p.paid_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.plan_name ? (
                        <div>
                          <p className="text-sm text-gray-800 font-medium">{p.plan_name}</p>
                          {p.billing_cycle && (
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              p.billing_cycle === 'yearly' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {p.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly'}
                            </span>
                          )}
                        </div>
                      ) : <span className="text-gray-400 text-sm">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={methodBadgeVariant(p.method)} className="capitalize text-[11px]">
                        {p.method.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-40 truncate" title={p.reference ?? undefined}>
                      {p.reference ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                      {p.period_start || p.period_end
                        ? <>{fmtDateStr(p.period_start)}<span className="mx-1 text-gray-400">→</span>{fmtDateStr(p.period_end)}</>
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                      {fmtGBP(p.amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs whitespace-nowrap">{p.created_by_name ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => deleteManualPayment(p.id)}
                        disabled={deletingPaymentId === p.id}
                        title="Delete this record"
                        className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {manualPayments.some((p) => p.notes) && (
          <div className="mt-3 space-y-1 border-t border-gray-50 pt-3">
            {manualPayments.filter((p) => p.notes).map((p) => (
              <p key={p.id} className="text-xs text-gray-600">
                <span className="text-teal-700 font-medium">{fmtDateStr(p.paid_at)}:</span> {p.notes}
              </p>
            ))}
          </div>
        )}
      </div>

      {recordPaymentOpen && manualPaymentBusiness && (
        <RecordManualPaymentModal
          business={manualPaymentBusiness}
          plans={plans}
          onClose={() => setRecordPaymentOpen(false)}
          onSaved={() => {
            setRecordPaymentOpen(false)
            queryClient.invalidateQueries({ queryKey: ['superadmin-manual-payments', businessId] })
            queryClient.invalidateQueries({ queryKey: ['superadmin-business-detail', businessId] })
            queryClient.invalidateQueries({ queryKey: ['superadmin-subscriptions'] })
            queryClient.invalidateQueries({ queryKey: ['superadmin-businesses'] })
          }}
        />
      )}

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
        <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 uppercase tracking-wide shrink-0">
          <Filter className="h-3.5 w-3.5 text-teal-600" />
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
            <div className="rounded-full bg-teal-50 p-4 mb-4">
              <Receipt className="h-6 w-6 text-teal-500" />
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
              <tr className="bg-primary">
                <th className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">#</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">Date</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">Description</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">Billing Period</th>
                <th className="px-5 py-3.5 text-right text-[11px] font-bold uppercase tracking-wider text-white">Amount</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-white">Status</th>
                <th className="px-5 py-3.5 text-right text-[11px] font-bold uppercase tracking-wider text-white">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((inv, idx) => (
                <tr key={inv.id} className={`hover:bg-teal-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  {/* # */}
                  <td className="px-5 py-4 text-gray-500 text-xs tabular-nums">
                    {filtered.length - idx}
                  </td>

                  {/* Date */}
                  <td className="px-5 py-4 whitespace-nowrap text-gray-800 font-medium">
                    {fmtUnix(inv.date)}
                  </td>

                  {/* Description */}
                  <td className="px-5 py-4 text-gray-700 max-w-[220px]">
                    <p className="truncate" title={inv.description ?? undefined}>
                      {inv.description ?? 'Subscription payment'}
                    </p>
                    <p className="text-[11px] text-gray-400 font-mono">{inv.id}</p>
                  </td>

                  {/* Billing period */}
                  <td className="px-5 py-4 whitespace-nowrap text-gray-600 text-xs">
                    {fmtUnix(inv.period_start)}
                    <span className="mx-1 text-gray-400">→</span>
                    {fmtUnix(inv.period_end)}
                  </td>

                  {/* Amount */}
                  <td className="px-5 py-4 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
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
