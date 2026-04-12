/**
 * SubscriptionSyncService
 *
 * Single source of truth for writing subscription state from Stripe events.
 * Used by both the webhook handler and the verify-upgrade endpoint so the
 * DB update logic is never duplicated.
 */
import { getAdminSupabase } from '@/backend/config/supabase'

interface SubscriptionPayload {
  businessId: string
  planId: string
  stripeSubId: string | null
  stripeCustomerId: string | null
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'suspended'
  billingCycle?: 'monthly' | 'yearly'
  trialEndsAt?: string | null
  currentPeriodStart?: string | null
  currentPeriodEnd?: string | null
}

export const SubscriptionSyncService = {
  /**
   * Upsert a subscription row by business_id.
   * Requires the UNIQUE constraint on subscriptions.business_id
   * (added in migration 053_subscriptions_unique_business.sql).
   */
  async upsert(payload: SubscriptionPayload): Promise<void> {
    const supabase = getAdminSupabase() as any

    await supabase
      .from('subscriptions')
      .upsert(
        {
          business_id:           payload.businessId,
          plan_id:               payload.planId,
          stripe_sub_id:         payload.stripeSubId,
          stripe_customer_id:    payload.stripeCustomerId,
          status:                payload.status,
          billing_cycle:         payload.billingCycle ?? 'monthly',
          trial_ends_at:         payload.trialEndsAt ?? null,
          current_period_start:  payload.currentPeriodStart ?? null,
          current_period_end:    payload.currentPeriodEnd ?? null,
        },
        { onConflict: 'business_id' }
      )
  },

  /**
   * Update period + status for an existing subscription row
   * identified by its Stripe subscription ID.
   * Called from invoice.payment_succeeded events.
   */
  async updatePeriod(params: {
    stripeSubId: string
    status: string
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
  }): Promise<void> {
    const supabase = getAdminSupabase() as any
    await supabase
      .from('subscriptions')
      .update({
        status:               params.status,
        current_period_start: params.currentPeriodStart,
        current_period_end:   params.currentPeriodEnd,
        trial_ends_at:        null, // trial is over once a real invoice is paid
      })
      .eq('stripe_sub_id', params.stripeSubId)
  },

  /**
   * Look up our internal plan_id from a Stripe price ID.
   * Returns null if no plan matches (unknown price ID).
   */
  async planIdFromStripePrice(stripePriceId: string): Promise<string | null> {
    const supabase = getAdminSupabase() as any
    const { data } = await supabase
      .from('plans')
      .select('id')
      .eq('stripe_price_id_monthly', stripePriceId)
      .maybeSingle()
    return data?.id ?? null
  },

  /**
   * Look up businessId from a Stripe subscription ID stored in our DB.
   */
  async businessIdFromStripeSubId(stripeSubId: string): Promise<string | null> {
    const supabase = getAdminSupabase() as any
    const { data } = await supabase
      .from('subscriptions')
      .select('business_id')
      .eq('stripe_sub_id', stripeSubId)
      .maybeSingle()
    return data?.business_id ?? null
  },

  /**
   * Deactivate all resources for a business on subscription cancellation.
   */
  async deactivate(businessId: string): Promise<void> {
    const supabase = getAdminSupabase() as any
    await Promise.all([
      supabase
        .from('subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('business_id', businessId),
      supabase
        .from('businesses')
        .update({ is_active: false })
        .eq('id', businessId),
    ])
  },
}
