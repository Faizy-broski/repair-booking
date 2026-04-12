import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/backend/config/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

export async function GET() {
  try {
    const supabaseUser = await createClient()
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('business_id, full_name, email')
      .eq('id', user.id)
      .single()

    if (!profile?.business_id) {
      return NextResponse.json({ error: 'No business found' }, { status: 400 })
    }

    const { data: business } = await (supabase as any)
      .from('businesses')
      .select('name, stripe_customer_id, stripe_subscription_id, trial_ends_at')
      .eq('id', profile.business_id)
      .single()

    // ── Load subscription row from DB ─────────────────────────────────────────
    let { data: sub } = await (supabase as any)
      .from('subscriptions')
      .select('status, trial_ends_at, current_period_start, current_period_end, billing_cycle, stripe_customer_id, stripe_sub_id, plan_id, plans(id, name, price_monthly, plan_type, features, max_branches, max_users)')
      .eq('business_id', profile.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // ── If no DB row, try to sync from Stripe ─────────────────────────────────
    // Handles accounts created before the subscription insert was fixed,
    // or where the webhook fired after check-registration already ran.
    if (!sub) {
      const stripeSubId = business?.stripe_subscription_id
      const stripeCustomerId = business?.stripe_customer_id

      if (stripeSubId || stripeCustomerId) {
        try {
          let stripeSub: Stripe.Subscription | null = null

          if (stripeSubId) {
            stripeSub = await stripe.subscriptions.retrieve(stripeSubId, {
              expand: ['items.data.price.product'],
            })
          } else if (stripeCustomerId) {
            // Find the most recent subscription for this customer
            const list = await stripe.subscriptions.list({
              customer: stripeCustomerId,
              limit: 1,
              status: 'all',
              expand: ['data.items.data.price.product'],
            })
            stripeSub = list.data[0] ?? null
          }

          if (stripeSub) {
            // Find which plan this maps to by price ID
            const priceId = stripeSub.items.data[0]?.price?.id ?? null
            const { data: matchedPlan } = await (supabase as any)
              .from('plans')
              .select('id, name, price_monthly, plan_type, features, max_branches, max_users')
              .eq('stripe_price_id_monthly', priceId)
              .maybeSingle()

            const planId = matchedPlan?.id ?? null

            // Backfill the subscription row and business Stripe IDs
            const subPayload = {
              business_id:          profile.business_id,
              plan_id:              planId,
              stripe_sub_id:        stripeSub.id,
              stripe_customer_id:   typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer?.id ?? null,
              status:               stripeSub.status,
              billing_cycle:        'monthly',
              current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
              current_period_end:   new Date(stripeSub.current_period_end * 1000).toISOString(),
              trial_ends_at:        stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
            }

            if (planId) {
              const { data: inserted } = await (supabase as any)
                .from('subscriptions')
                .upsert(subPayload, { onConflict: 'business_id' })
                .select('status, trial_ends_at, current_period_start, current_period_end, billing_cycle, stripe_customer_id, stripe_sub_id, plan_id, plans(id, name, price_monthly, plan_type, features, max_branches, max_users)')
                .maybeSingle()
              sub = inserted
            }

            // Also update businesses table with Stripe IDs
            await (supabase as any)
              .from('businesses')
              .update({
                stripe_customer_id:     subPayload.stripe_customer_id,
                stripe_subscription_id: stripeSub.id,
              })
              .eq('id', profile.business_id)

            // If we couldn't match a plan, build a synthetic sub for display
            if (!sub) {
              sub = {
                status:               stripeSub.status,
                trial_ends_at:        subPayload.trial_ends_at,
                current_period_start: subPayload.current_period_start,
                current_period_end:   subPayload.current_period_end,
                billing_cycle:        'monthly',
                stripe_customer_id:   subPayload.stripe_customer_id,
                stripe_sub_id:        stripeSub.id,
                plan_id:              null,
                plans:                matchedPlan ?? null,
              }
            }
          }
        } catch (stripeErr) {
          console.error('[account/subscription] Stripe sync failed:', stripeErr)
        }
      }
    }

    // ── If DB row has no period dates, sync them from Stripe now ─────────────
    // This happens when verify-upgrade ran but the Stripe subscription retrieval
    // failed silently, or when the row was written before period dates were tracked.
    // Use stripe_sub_id from the sub row first, fall back to businesses table.
    const fallbackStripeSubId =
      (sub?.stripe_sub_id as string | null) ??
      (business?.stripe_subscription_id as string | null) ?? null

    if (sub && !sub.current_period_end && fallbackStripeSubId) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(fallbackStripeSubId)
        const patchedStart = stripeSub.current_period_start
          ? new Date(stripeSub.current_period_start * 1000).toISOString() : null
        const patchedEnd = stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000).toISOString() : null

        if (patchedEnd) {
          await (supabase as any)
            .from('subscriptions')
            .update({
              current_period_start: patchedStart,
              current_period_end:   patchedEnd,
              status:               stripeSub.status,
              stripe_sub_id:        fallbackStripeSubId,
            })
            .eq('business_id', profile.business_id)

          sub.current_period_start = patchedStart
          sub.current_period_end   = patchedEnd
          sub.status               = stripeSub.status
          sub.stripe_sub_id        = fallbackStripeSubId
        }
      } catch (patchErr) {
        console.error('[account/subscription] period-date patch failed:', patchErr)
      }
    }

    // Resolve plan — FK join on plans may come back as an array in some PostgREST versions
    const rawPlans = sub?.plans
    let planData = Array.isArray(rawPlans) ? (rawPlans[0] ?? null) : (rawPlans ?? null)

    // Direct fallback if join didn't resolve
    if (!planData && sub?.plan_id) {
      const { data: directPlan } = await (supabase as any)
        .from('plans')
        .select('id, name, price_monthly, plan_type, features, max_branches, max_users')
        .eq('id', sub.plan_id)
        .maybeSingle()
      planData = directPlan
    }

    // Resolve effective stripe_customer_id (business row takes precedence)
    const effectiveCustomerId =
      business?.stripe_customer_id ?? sub?.stripe_customer_id ?? null

    return NextResponse.json({
      data: {
        user: {
          id:        user.id,
          email:     user.email,
          full_name: profile.full_name,
        },
        business: {
          name:               business?.name ?? null,
          stripe_customer_id: effectiveCustomerId,
        },
        subscription: sub
          ? {
              status:               sub.status,
              trial_ends_at:        sub.trial_ends_at,
              current_period_start: sub.current_period_start,
              current_period_end:   sub.current_period_end,
              billing_cycle:        sub.billing_cycle,
              plan:                 planData,
            }
          : null,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    console.error('[account/subscription]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
