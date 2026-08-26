'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { X, RefreshCw, AlertCircle, Landmark } from 'lucide-react'
import type { PlanOption } from '@/components/superadmin/edit-subscription-modal'
import { CUSTOM_PLAN_YEARLY_DISCOUNT } from '@/backend/services/custom-plan-pricing'

export interface ManualPaymentBusiness {
  id: string
  name: string
  subscriptions?: Array<{
    status: string
    billing_cycle: string | null
    current_period_end: string | null
    trial_ends_at: string | null
    plan_id?: string | null
    is_custom?: boolean | null
    custom_price_monthly?: number | null
  }> | null
}

const METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash',          label: 'Cash' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'other',         label: 'Other' },
] as const

const STATUSES = [
  { value: 'active',    label: 'Active' },
  { value: 'trialing',  label: 'Trialing' },
  { value: 'past_due',  label: 'Past Due' },
  { value: 'canceled',  label: 'Canceled' },
  { value: 'suspended', label: 'Suspended' },
] as const

type Method = typeof METHODS[number]['value']
type Status = typeof STATUSES[number]['value']
type Cycle = 'monthly' | 'yearly'

function todayInput(): string {
  return new Date().toISOString().slice(0, 10)
}

// Adds one billing cycle to a date, used to prefill the period-end suggestions
// — same rough duration Stripe uses.
function addCycle(dateStr: string, cycle: Cycle): string {
  const d = new Date(dateStr || todayInput())
  if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

function fmtGBP(amount: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 }).format(amount)
}

export function RecordManualPaymentModal({
  business,
  plans,
  onClose,
  onSaved,
}: {
  business: ManualPaymentBusiness
  plans: PlanOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const sub = business.subscriptions?.[0]
  const defaultCycle: Cycle = sub?.billing_cycle === 'yearly' ? 'yearly' : 'monthly'

  const [planId, setPlanId]         = useState(sub?.plan_id ?? '')
  const [billingCycle, setBillingCycle] = useState<Cycle>(defaultCycle)
  const [method, setMethod]         = useState<Method>('bank_transfer')
  const [reference, setReference]   = useState('')
  const [paidAt, setPaidAt]         = useState(todayInput())
  const [periodStart, setPeriodStart] = useState(todayInput())
  const [periodEnd, setPeriodEnd]     = useState(addCycle(todayInput(), defaultCycle))
  const [notes, setNotes]           = useState('')

  const [extend, setExtend]           = useState(true)
  const [newStatus, setNewStatus]     = useState<Status>('active')
  const [newPeriodEnd, setNewPeriodEnd] = useState(addCycle(todayInput(), defaultCycle))

  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const selectedPlan = plans.find((p) => p.id === planId)
  const isCustomPlan = selectedPlan?.plan_type === 'custom'
  const businessCustomMonthly = sub?.is_custom ? (sub?.custom_price_monthly ?? null) : null

  // Amount is always derived, never typed — mirrors the server's own
  // computation in POST .../manual-payments (never trust a client-sent total).
  const computedAmount = useMemo(() => {
    if (!selectedPlan) return null
    if (isCustomPlan) {
      if (businessCustomMonthly == null) return null
      return billingCycle === 'yearly'
        ? Math.round(businessCustomMonthly * 12 * (1 - CUSTOM_PLAN_YEARLY_DISCOUNT) * 100) / 100
        : businessCustomMonthly
    }
    return billingCycle === 'yearly'
      ? (selectedPlan.price_yearly ?? selectedPlan.price_monthly * 12)
      : selectedPlan.price_monthly
  }, [selectedPlan, isCustomPlan, businessCustomMonthly, billingCycle])

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

  function onPaidAtChange(v: string) {
    setPaidAt(v)
    // Keep the period-covered and extend-period suggestions in sync until the admin edits them directly
    setPeriodStart(v)
    setPeriodEnd(addCycle(v, billingCycle))
    setNewPeriodEnd(addCycle(v, billingCycle))
  }

  function onCycleChange(c: Cycle) {
    setBillingCycle(c)
    setPeriodEnd(addCycle(paidAt, c))
    setNewPeriodEnd(addCycle(paidAt, c))
  }

  async function handleSave() {
    if (!planId) { setError('Select a plan'); return }
    if (computedAmount == null) { setError('Could not work out an amount for this plan'); return }
    if (!paidAt) { setError('Payment date is required'); return }

    setSaving(true)
    setError(null)
    setWarning(null)
    try {
      const res = await fetch(`/api/admin/subscriptions/${business.id}/manual-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          billingCycle,
          method,
          reference: reference || undefined,
          paidAt,
          periodStart: periodStart || undefined,
          periodEnd: periodEnd || undefined,
          notes: notes || undefined,
          extendSubscription: extend,
          newStatus: extend ? newStatus : undefined,
          newPeriodEnd: extend ? newPeriodEnd : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to record payment')
      if (json.subscriptionExtendError) {
        setWarning(`Payment recorded, but subscription wasn't extended: ${json.subscriptionExtendError}`)
        return
      }
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Record manual payment — ${business.name}`}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-teal-50 p-2">
              <Landmark className="h-4 w-4 text-teal-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Record Manual Payment</h2>
              <p className="mt-0.5 text-sm text-gray-500">{business.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 overflow-y-auto px-6 py-5">
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
                  {p.name}{!p.is_active ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Billing cycle */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Billing Cycle</label>
            <div className="flex gap-2">
              {(['monthly', 'yearly'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onCycleChange(c)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors capitalize ${
                    billingCycle === c
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Derived amount */}
          <div className="rounded-lg border border-teal-100 bg-teal-50/60 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-teal-900">Amount</span>
            {computedAmount != null ? (
              <span className="text-lg font-bold text-teal-700 tabular-nums">{fmtGBP(computedAmount)}</span>
            ) : (
              <span className="text-xs text-amber-700 font-medium">
                {planId ? 'No price set for this plan' : 'Select a plan'}
              </span>
            )}
          </div>
          {isCustomPlan && businessCustomMonthly == null && (
            <p className="text-xs text-amber-700 -mt-2">
              This business has no negotiated Custom Plan price yet — set one via Edit Subscription first.
            </p>
          )}

          {/* Method */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Payment Method</label>
            <div className="grid grid-cols-4 gap-1.5">
              {METHODS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMethod(value)}
                  className={`rounded-lg py-2 text-xs font-medium transition-colors border ${
                    method === value
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Reference */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Reference
              <span className="ml-1 text-xs font-normal text-gray-400">(optional — bank transaction ref, cheque no.)</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. HSBC-REF-123456"
              className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-colors"
            />
          </div>

          {/* Payment date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Payment Date</label>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => onPaidAtChange(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-colors"
            />
          </div>

          {/* Billing period covered */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Billing Period Covered</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-colors"
              />
              <span className="text-gray-400 text-sm shrink-0">to</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-colors"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Notes
              <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything else worth noting about this transaction…"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-colors resize-none"
            />
          </div>

          {/* Extend subscription toggle */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={extend}
                onChange={(e) => setExtend(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500/30"
              />
              <span className="text-sm font-medium text-gray-800">Also extend / activate subscription under this plan</span>
            </label>

            {extend && (
              <div className="space-y-3 pl-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">New Status</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {STATUSES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setNewStatus(value)}
                        className={`rounded-lg py-1.5 text-[11px] font-medium transition-colors border ${
                          newStatus === value
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
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600">New Period End</label>
                  <input
                    type="date"
                    value={newPeriodEnd}
                    onChange={(e) => setNewPeriodEnd(e.target.value)}
                    className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-colors"
                  />
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Sets the subscription to this plan/cycle on your platform only — it does not touch Stripe.
                </p>
              </div>
            )}
          </div>

          {/* Warning */}
          {warning && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-800">{warning}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {warning ? 'Close' : 'Cancel'}
          </button>
          {!warning && (
            <button
              onClick={handleSave}
              disabled={saving || !planId || computedAmount == null}
              className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-700 active:bg-teal-800 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              {saving ? 'Saving…' : 'Record Payment'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
