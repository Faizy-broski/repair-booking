/**
 * Renewal-anchor maths: paying late (in grace or after) must never move the
 * renewal day. Expired 21 Oct, paid 22 Oct → next renewal 21 Nov, not 22 Nov.
 *
 * All maths in UTC (period dates are stored as UTC timestamps). The anchor day
 * is clamped to short months and restored afterwards:
 * 31 Jan → 28/29 Feb → 31 Mar.
 */

export type BillingCycle = 'monthly' | 'yearly'

const daysInMonthUTC = (year: number, month0: number) => new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()

/** One cycle after `date`, landing on `anchorDay` (clamped to the month length), same time of day. */
export function addCycleKeepingDay(date: Date, cycle: BillingCycle, anchorDay: number): Date {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const targetYear = cycle === 'yearly' ? y + 1 : (m === 11 ? y + 1 : y)
  const targetMonth = cycle === 'yearly' ? m : (m + 1) % 12
  const day = Math.min(anchorDay, daysInMonthUTC(targetYear, targetMonth))
  return new Date(Date.UTC(
    targetYear, targetMonth, day,
    date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds(),
  ))
}

/**
 * Next period end on the original cycle: `oldEnd + k cycles` for the smallest
 * k ≥ 1 that is after `now`.
 *  - paid early / on time / in grace → oldEnd + 1 cycle
 *  - paid weeks late                 → still lands on the original renewal day
 */
export function nextPeriodEnd(oldEnd: Date, cycle: BillingCycle, now: Date = new Date()): Date {
  const anchorDay = oldEnd.getUTCDate()
  let next = addCycleKeepingDay(oldEnd, cycle, anchorDay)
  // Bounded loop (≈ 50 years of monthly cycles) — guards against bad input
  for (let i = 0; next.getTime() <= now.getTime() && i < 600; i++) {
    next = addCycleKeepingDay(next, cycle, anchorDay)
  }
  return next
}
