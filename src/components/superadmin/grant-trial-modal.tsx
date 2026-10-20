'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { X, Gift, AlertCircle } from 'lucide-react'
import type { PlanOption } from '@/components/superadmin/edit-subscription-modal'

const PRESET_DAYS = [7, 14, 30] as const

/**
 * Superadmin-only: grant a free trial to any business. Self-serve signups
 * must pay, so this is the only way a business gets trial access.
 * Calls POST /api/admin/subscriptions/[businessId]/grant-trial.
 */
export function GrantTrialModal({
  business,
  plans,
  defaultPlanId,
  onClose,
  onSaved,
}: {
  business: { id: string; name: string }
  plans: PlanOption[]
  defaultPlanId?: string | null
  onClose: () => void
  onSaved: () => void
}) {
  // Enterprise needs manual setup; custom plans need limits (use Edit Subscription)
  const trialPlans = useMemo(
    () => plans.filter((p) => p.is_active && p.plan_type !== 'enterprise'),
    [plans]
  )
  const [planId, setPlanId] = useState(
    defaultPlanId && trialPlans.some((p) => p.id === defaultPlanId) ? defaultPlanId : (trialPlans[0]?.id ?? '')
  )
  const [mode, setMode]     = useState<'days' | 'date'>('days')
  const [days, setDays]     = useState('14')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

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

  const previewEnd = useMemo(() => {
    if (mode === 'date') return endDate ? new Date(`${endDate}T23:59:59`) : null
    const n = Number(days)
    return Number.isInteger(n) && n > 0 ? new Date(Date.now() + n * 86_400_000) : null
  }, [mode, days, endDate])

  async function handleSave() {
    if (!planId) { setError('Please select a plan'); return }
    if (!previewEnd) { setError(mode === 'days' ? 'Enter a number of days' : 'Pick an end date'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/subscriptions/${business.id}/grant-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'days' ? { planId, days: Number(days) } : { planId, trialEndsAt: endDate }
        ),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to grant trial')
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10)

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
        aria-label={`Grant free trial — ${business.name}`}
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl outline-none"
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-gray-100 px-6 py-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <Gift className="h-5 w-5 text-teal-600" /> Grant Free Trial
            </h2>
            <p className="mt-0.5 text-sm text-gray-500 font-mono">{business.name}</p>
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Plan during trial</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-colors"
            >
              <option value="">Select a plan…</option>
              {trialPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.price_monthly > 0 ? ` — £${p.price_monthly}/mo after trial` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Trial length</label>
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
                {(['days', 'date'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${mode === m ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    {m === 'days' ? 'Days' : 'End date'}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'days' ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="h-10 w-24 rounded-lg border border-gray-300 px-3 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
                <span className="text-sm text-gray-500">days</span>
                <div className="ml-auto flex gap-1">
                  {PRESET_DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDays(String(d))}
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${days === String(d) ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <input
                type="date"
                min={todayStr}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            )}

            {previewEnd && (
              <p className="text-xs text-gray-500">
                Trial ends <span className="font-semibold text-gray-700">{previewEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>.
                After that the business must pay to keep access.
              </p>
            )}
          </div>

          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Sets the subscription to <b>Trialing</b> and unlocks the account immediately. Works for new, unpaid,
            expired or canceled businesses. Businesses with a live paid Stripe subscription can&apos;t be put on a trial.
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? 'Granting…' : 'Grant trial'}
          </button>
        </div>
      </div>
    </div>
  )
}
