'use client'
import { useState, useRef, useEffect } from 'react'
import { X, RefreshCw, AlertCircle, TriangleAlert } from 'lucide-react'
import type { SubscriptionRow } from '@/app/api/admin/subscriptions/route'

export interface PlanOption {
  id: string
  name: string
  price_monthly: number
  price_yearly: number
  is_active: boolean
}

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

export function EditSubscriptionModal({
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
  const [planId, setPlanId]             = useState(row.plan_id ?? '')
  const [status, setStatus]             = useState<EditStatus>((row.status as EditStatus) ?? 'active')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>((row.billing_cycle as any) ?? 'monthly')
  const [periodEnd, setPeriodEnd]       = useState(toDateInput(row.current_period_end))
  const [trialEndsAt, setTrialEndsAt]   = useState(toDateInput(row.trial_ends_at))
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)

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
          trialEndsAt: status === 'trialing' ? (trialEndsAt || null) : null,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
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
                  {p.name}{!p.is_active ? ' (inactive)' : ''}{' — '}
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
