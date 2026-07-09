/**
 * SubscriptionSyncService
 *
 * Single source of truth for writing subscription state from Stripe events.
 * Used by both the webhook handler and the verify-upgrade endpoint so the
 * DB update logic is never duplicated.
 */
import Stripe from 'stripe'
import { getAdminSupabase } from '@/backend/config/supabase'

interface CustomPlanOverrides {
  maxBranches: number
  maxUsers: number
  maxProducts: number | null
  maxServices: number | null
  priceMonthly: number
}

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
  /** Set from Stripe event.livemode. False = test-mode data that should be excluded from real stats. */
  livemode?: boolean
  /** Present only when this subscription is a customer-built Custom Plan. */
  customOverrides?: CustomPlanOverrides
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
          livemode:              payload.livemode ?? false,
          is_custom:             !!payload.customOverrides,
          custom_max_branches:   payload.customOverrides?.maxBranches ?? null,
          custom_max_users:      payload.customOverrides?.maxUsers ?? null,
          custom_max_products:   payload.customOverrides?.maxProducts ?? null,
          custom_max_services:   payload.customOverrides?.maxServices ?? null,
          custom_price_monthly:  payload.customOverrides?.priceMonthly ?? null,
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

  /**
   * Safety net for dropped/misrouted Stripe webhooks: re-fetches every
   * non-suspended subscription's live status from Stripe and corrects drift.
   * 'suspended' rows are admin-managed (superadmin manual lock, independent of
   * Stripe) and are skipped entirely — this must never un-suspend an account.
   */
  async reconcileAllFromStripe(): Promise<{ checked: number; corrected: number; errors: number }> {
    const supabase = getAdminSupabase() as any
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

    const { data: rows } = await supabase
      .from('subscriptions')
      .select('business_id, stripe_sub_id, status, current_period_end')
      .not('stripe_sub_id', 'is', null)
      .neq('status', 'suspended')

    const list = (rows ?? []) as Array<{
      business_id: string
      stripe_sub_id: string
      status: string
      current_period_end: string | null
    }>

    let corrected = 0
    let errors = 0
    const CONCURRENCY = 5

    for (let i = 0; i < list.length; i += CONCURRENCY) {
      const batch = list.slice(i, i + CONCURRENCY)
      await Promise.all(
        batch.map(async (row) => {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(row.stripe_sub_id, { expand: ['items'] })
            const item = stripeSub.items?.data?.[0] as any
            const rawEnd = (stripeSub as any).current_period_end ?? item?.current_period_end
            const rawStart = (stripeSub as any).current_period_start ?? item?.current_period_start
            const newEnd = rawEnd ? new Date(rawEnd * 1000).toISOString() : null
            const newStart = rawStart ? new Date(rawStart * 1000).toISOString() : null

            const statusChanged = stripeSub.status !== row.status
            const periodChanged = newEnd !== row.current_period_end
            if (!statusChanged && !periodChanged) return

            await supabase
              .from('subscriptions')
              .update({ status: stripeSub.status, current_period_start: newStart, current_period_end: newEnd })
              .eq('business_id', row.business_id)

            // Re-check is_suspended immediately before writing is_active, in case
            // a superadmin suspended this business concurrently with this run.
            const { data: business } = await supabase
              .from('businesses')
              .select('is_suspended')
              .eq('id', row.business_id)
              .maybeSingle()

            if (!business?.is_suspended) {
              await supabase
                .from('businesses')
                .update({ is_active: stripeSub.status !== 'canceled' })
                .eq('id', row.business_id)
            }

            corrected += 1
          } catch (err) {
            console.error('[reconcileAllFromStripe] failed for', row.business_id, err)
            errors += 1
          }
        })
      )
    }

    return { checked: list.length, corrected, errors }
  },
}
