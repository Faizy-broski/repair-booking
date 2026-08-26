import { invalidateBusinessCache } from '@/backend/services/module-config.service'

export const SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'suspended'] as const
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number]

// Whether a business should be marked is_active for a given subscription status.
// Mirrors resolveIsActive() in PATCH /api/admin/subscriptions/[businessId].
export function resolveIsActive(status: SubscriptionStatus) {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

/**
 * Minimal subscription "extend/activate" update — used when a manual (bank
 * transfer/cash/cheque) payment is recorded and the admin wants to push out
 * current_period_end / status (and, since the payment is now always tied to
 * a specific plan, keep plan_id/billing_cycle in sync with what was actually
 * paid for). Mirrors the sync steps in PATCH /api/admin/subscriptions/[businessId]
 * (subscription update + businesses.is_active + module cache invalidation)
 * but scoped to just these fields — it never creates a subscription row,
 * since a plan must already be assigned via "Edit Subscription" first.
 *
 * Returns false if the business has no subscription row yet.
 */
export async function extendSubscriptionPeriod(
  supabase: any,
  businessId: string,
  { status, currentPeriodEnd, planId, billingCycle }: {
    status: SubscriptionStatus
    currentPeriodEnd: string
    planId?: string
    billingCycle?: 'monthly' | 'yearly'
  }
): Promise<boolean> {
  const canceledAt = status === 'canceled' ? new Date().toISOString() : null

  const { data: updated, error: subErr } = await supabase
    .from('subscriptions')
    .update({
      status,
      current_period_end: currentPeriodEnd,
      canceled_at: canceledAt,
      ...(planId ? { plan_id: planId } : {}),
      ...(billingCycle ? { billing_cycle: billingCycle } : {}),
    })
    .eq('business_id', businessId)
    .select('id')

  if (subErr) throw new Error(subErr.message)
  if (!updated || updated.length === 0) return false

  const { error: bizErr } = await supabase
    .from('businesses')
    .update({ is_active: resolveIsActive(status) })
    .eq('id', businessId)

  if (bizErr) {
    // Non-fatal — subscription was saved, just log (same tolerance as the PATCH route)
    console.error('[extendSubscriptionPeriod] business update error:', bizErr.message)
  }

  await invalidateBusinessCache(businessId)
  return true
}
