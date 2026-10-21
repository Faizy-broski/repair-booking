/**
 * Subscription access rules, including the 24h grace period.
 *
 * Pure (no Node/DB imports) so it runs in edge middleware and on the server.
 *
 * SAFETY: grace can only ever RELAX a lock — access is
 *   today's rule  OR  "still within 24h of the paid subscription lapsing"
 * so no business that has access under the old rule can lose it.
 */

export const GRACE_MS = 24 * 60 * 60 * 1000

export interface SubscriptionLike {
  status: string | null
  trial_ends_at: string | null
  current_period_start?: string | null
  current_period_end?: string | null
  stripe_sub_id?: string | null
  plan_type?: string | null
}

const toTime = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN)

/** The pre-grace checks, exactly as middleware.ts / session-context had them inline. */
export function legacyChecks(sub: SubscriptionLike | null, now = Date.now()) {
  const freeTrialExpired = !!(sub?.plan_type === 'free' && sub.trial_ends_at && toTime(sub.trial_ends_at) < now)
  const paidSubInactive = !!(sub?.status && !sub.trial_ends_at && !['active', 'trialing'].includes(sub.status))
  const manualSubExpired = !!(!sub?.stripe_sub_id && sub?.current_period_end && toTime(sub.current_period_end) < now)
  return { freeTrialExpired, paidSubInactive, manualSubExpired }
}

/**
 * When did this PAID subscription lapse, and does its 24h grace still run?
 * Trials never get grace (they lock exactly as before).
 */
export function graceWindow(sub: SubscriptionLike | null, now = Date.now()) {
  const none = { expiredAt: null as string | null, graceEndsAt: null as string | null, inGrace: false }
  if (!sub?.status) return none

  const end = toTime(sub.current_period_end)
  const start = toTime(sub.current_period_start)
  let expiredAt = NaN

  if (sub.status === 'past_due') {
    // Stripe rolls the period forward to the unpaid renewal as soon as it
    // invoices, so the lapse moment is the new period's start — unless our
    // copy is stale (webhook lag) and the old end has already passed.
    expiredAt = Number.isFinite(end) && end <= now ? end : start
  } else if (sub.status === 'active' && !sub.stripe_sub_id && Number.isFinite(end) && end <= now) {
    // Manual (bank transfer / cash) subscription whose paid period has ended
    expiredAt = end
  }

  if (!Number.isFinite(expiredAt) || expiredAt > now) return none
  const graceEnds = expiredAt + GRACE_MS
  return {
    expiredAt: new Date(expiredAt).toISOString(),
    graceEndsAt: new Date(graceEnds).toISOString(),
    inGrace: now < graceEnds,
  }
}

/**
 * Final access decision for a surface.
 * - 'middleware': old rule = !(freeTrialExpired || paidSubInactive)  (no manual-expiry check, as before)
 * - 'session':    old rule = !(freeTrialExpired || paidSubInactive || manualSubExpired)
 */
export function resolveAccess(sub: SubscriptionLike | null, surface: 'middleware' | 'session', now = Date.now()) {
  const c = legacyChecks(sub, now)
  const oldRule = surface === 'middleware'
    ? !(c.freeTrialExpired || c.paidSubInactive)
    : !(c.freeTrialExpired || c.paidSubInactive || c.manualSubExpired)
  const g = graceWindow(sub, now)
  return {
    hasAccess: oldRule || g.inGrace,
    // Grace is only ever computed for past_due / lapsed-manual subscriptions,
    // so "in grace" simply means "payment is due — show the countdown".
    inGrace: g.inGrace,
    graceEndsAt: g.inGrace ? g.graceEndsAt : null,
  }
}
