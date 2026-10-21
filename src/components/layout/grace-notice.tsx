'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/** "17h 05m" style countdown, refreshed every 30s. */
function useCountdown(until: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!until) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [until])
  if (!until) return null
  const ms = Math.max(0, new Date(until).getTime() - now)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

/**
 * Pay the open Stripe invoice (keeps the original billing anchor). Falls back
 * to the account billing tab when there's no card subscription (manual plans).
 */
export async function payOutstanding(isStripe: boolean) {
  if (!isStripe) {
    window.location.href = '/account?tab=billing'
    return
  }
  try {
    const res = await fetch('/api/stripe/open-invoice')
    const json = await res.json()
    if (res.ok && json.data?.url) window.location.href = json.data.url
    else toast.error(json.error?.message ?? 'Could not open the payment page. Please try again.')
  } catch {
    toast.error('Could not open the payment page. Please try again.')
  }
}

/** Compact sidebar notice — access is still on, but payment is due. */
export function GraceSidebarNotice({ graceEndsAt, collapsed }: { graceEndsAt: string | null | undefined; collapsed?: boolean }) {
  const left = useCountdown(graceEndsAt)
  return (
    <Link
      href="/account?tab=billing"
      title={left ? `Payment due — access locks in ${left}` : 'Payment due'}
      className={cn(
        'flex items-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 px-3 py-2.5 text-amber-400 hover:bg-amber-500/20 transition-colors',
        collapsed ? 'justify-center' : ''
      )}
    >
      <Clock className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">Payment due</p>
          <p className="text-[11px] text-amber-400/80 truncate">Access locks in {left ?? '—'} · Pay now →</p>
        </div>
      )}
    </Link>
  )
}

/** Full-width account-page banner with a Pay now action. */
export function GraceAccountBanner({ graceEndsAt, isStripe }: { graceEndsAt: string | null | undefined; isStripe: boolean }) {
  const left = useCountdown(graceEndsAt)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div>
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            Payment due — access locks in {left ?? '—'}
          </p>
          <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">
            Your subscription has expired. Everything keeps working for now — pay before the timer ends to avoid
            interruption. Your renewal date stays the same.
          </p>
        </div>
      </div>
      {isStripe && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); await payOutstanding(true); setBusy(false) }}
          className="shrink-0 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Pay now'}
        </button>
      )}
    </div>
  )
}
