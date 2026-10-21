'use client'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, X, Loader2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { RecordManualPaymentModal } from '@/components/superadmin/record-manual-payment-modal'
import type { PlanOption } from '@/components/superadmin/edit-subscription-modal'
import type { PaymentCheckItem, PaymentCheckGroup } from '@/app/api/admin/payment-checks/route'

const GROUPS: { key: PaymentCheckGroup; label: string; tone: string }[] = [
  { key: 'grace',   label: 'In grace — confirm today', tone: 'text-amber-700' },
  { key: 'due',     label: 'Due within 24h',           tone: 'text-teal-700' },
  { key: 'overdue', label: 'Overdue',                  tone: 'text-red-700' },
]

const fmtGBP = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n)
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function timeLeft(until: string, now: number) {
  const ms = Math.max(0, new Date(until).getTime() - now)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/**
 * Superadmin header bell: "Has <business> paid?" for manual subscriptions that
 * reached their end date. Yes → Record Manual Payment (pre-filled, same renewal
 * day). No → record the answer; the business keeps the rest of its 24h grace and
 * then locks as normal. No interval polling — refetches when opened / on focus.
 */
export function PaymentChecksBell() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [recording, setRecording] = useState<PaymentCheckItem | null>(null)
  const [confirmNo, setConfirmNo] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const { data: items = [], isFetching, refetch } = useQuery({
    queryKey: ['payment-checks'],
    queryFn: async () => {
      const res = await fetch('/api/admin/payment-checks')
      if (!res.ok) throw new Error('Failed to load payment checks')
      return ((await res.json()).data ?? []) as PaymentCheckItem[]
    },
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  })

  const { data: plansData } = useQuery({
    queryKey: ['superadmin-plans'],
    queryFn: async () => {
      const res = await fetch('/api/plans?all=true')
      if (!res.ok) throw new Error('Failed to load plans')
      return res.json()
    },
    enabled: !!recording,
    staleTime: 10 * 60 * 1000,
  })
  const plans: PlanOption[] = plansData?.data ?? []

  // Close on outside click; tick the countdowns while open
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setConfirmNo(null) }
    }
    document.addEventListener('mousedown', onDown)
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => { document.removeEventListener('mousedown', onDown); clearInterval(t) }
  }, [open])

  async function decide(item: PaymentCheckItem, decision: 'paid' | 'unpaid') {
    const res = await fetch('/api/admin/payment-checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessId: item.businessId, cycleKey: item.cycleKey, decision }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error ?? 'Failed to save')
  }

  async function markUnpaid(item: PaymentCheckItem) {
    setBusy(item.businessId)
    try {
      await decide(item, 'unpaid')
      toast.success(`${item.businessName} marked as not paid — access locks automatically when the grace period ends.`)
      setConfirmNo(null)
      queryClient.invalidateQueries({ queryKey: ['payment-checks'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
      refetch()
    } finally {
      setBusy(null)
    }
  }

  const urgent = items.some((i) => i.group !== 'due')
  const count = items.length

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); if (!open) refetch() }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
        aria-label={`Payment checks${count ? ` (${count} waiting)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${urgent ? 'bg-red-500' : 'bg-teal-600'}`}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,400px)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Payment checks</p>
              <p className="text-[11px] text-gray-500">Manual subscriptions that reached their end date</p>
            </div>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {count === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">Nothing to confirm right now.</p>
            ) : GROUPS.map((g) => {
              const groupItems = items.filter((i) => i.group === g.key)
              if (groupItems.length === 0) return null
              return (
                <div key={g.key}>
                  <p className={`bg-gray-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide ${g.tone}`}>
                    {g.label} · {groupItems.length}
                  </p>
                  {groupItems.map((item) => (
                    <div key={`${item.businessId}-${item.cycleKey}`} className="border-b border-gray-100 px-4 py-3 last:border-b-0">
                      <p className="text-sm font-medium text-gray-900">Has <span className="font-semibold">{item.businessName}</span> paid?</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {item.planName ?? 'Plan'} · {fmtGBP(item.amountDue)}/{item.billingCycle === 'yearly' ? 'yr' : 'mo'} · {item.group === 'due' ? 'ends' : 'ended'} {fmtDate(item.periodEnd)}
                      </p>
                      {item.group === 'grace' && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700">
                          <Clock className="h-3 w-3" /> Locks in {timeLeft(item.graceEndsAt, now)} if unpaid
                        </p>
                      )}

                      {confirmNo === item.businessId ? (
                        <div className="mt-2 rounded-lg bg-gray-50 p-2">
                          <p className="text-xs text-gray-600">
                            {item.group === 'overdue'
                              ? 'Keep it locked and clear this check?'
                              : 'They keep the remaining grace period and then lock automatically. Continue?'}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              disabled={busy === item.businessId}
                              onClick={() => markUnpaid(item)}
                              className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
                            >
                              {busy === item.businessId && <Loader2 className="h-3 w-3 animate-spin" />} Yes, not paid
                            </button>
                            <button type="button" onClick={() => setConfirmNo(null)} className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => { setRecording(item); setOpen(false) }}
                            className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                          >
                            <Check className="h-3.5 w-3.5" /> Yes, paid
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmNo(item.businessId)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            <X className="h-3.5 w-3.5" /> No
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {recording && (
        <RecordManualPaymentModal
          business={recording.business}
          plans={plans}
          onClose={() => setRecording(null)}
          onSaved={async () => {
            const item = recording
            setRecording(null)
            // Audit trail for the answered cycle (the payment itself already extended the period)
            try { await decide(item, 'paid') } catch { /* audit only — the payment is recorded */ }
            toast.success(`Payment recorded for ${item.businessName}.`)
            queryClient.invalidateQueries({ queryKey: ['payment-checks'] })
            queryClient.invalidateQueries({ queryKey: ['superadmin-businesses'] })
          }}
        />
      )}
    </div>
  )
}
