import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/backend/config/supabase'
import { SubscriptionSyncService } from '@/backend/services/subscription-sync.service'
import { invalidateBusinessCache } from '@/backend/services/module-config.service'
import { SubscriptionEmailService } from '@/backend/services/subscription-email.service'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

/**
 * POST /api/stripe/verify-upgrade
 * Body: { sessionId: string }
 *
 * Called when the user returns from Stripe Checkout with ?upgraded=1&session_id=...
 * Verifies payment with Stripe directly, then writes the subscription to the DB.
 * This is the reliable, synchronous counterpart to the async webhook — it ensures
 * the UI reflects the new plan immediately on successful redirect, regardless of
 * whether the webhook has fired yet.
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate caller
    const supabaseUser = await createClient()
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: { message: 'Unauthorised' } }, { status: 401 })
    }

    const body = await request.json()
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : null
    if (!sessionId || !sessionId.startsWith('cs_')) {
      return NextResponse.json({ error: { message: 'Invalid session ID' } }, { status: 400 })
    }

    // Verify session with Stripe
    // 'paid' = immediate charge succeeded
    // 'no_payment_required' = subscription started with a trial period (£0 due today)
    // Both are valid — the subscription is confirmed either way
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const validPaymentStatus = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
    if (!validPaymentStatus || session.mode !== 'subscription') {
      return NextResponse.json({ error: { message: 'Payment not completed' } }, { status: 400 })
    }

    const businessId = session.metadata?.businessId
    const isCustom   = session.metadata?.isCustom === 'true'
    const planId     = session.metadata?.planId
    if (!businessId || (!planId && !isCustom)) {
      return NextResponse.json({ error: { message: 'Missing metadata in Stripe session' } }, { status: 400 })
    }

    // Security: verify the caller belongs to the business on the session
    const supabase = createAdminClient()
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .single()

    if (!profile || profile.business_id !== businessId) {
      return NextResponse.json({ error: { message: 'Forbidden' } }, { status: 403 })
    }

    const stripeSubId = typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? null

    // Fetch period dates from the Stripe subscription
    let periodStart: string | null = null
    let periodEnd: string | null = null
    if (stripeSubId) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId, { expand: ['items'] })
        const item = stripeSub.items?.data?.[0] as any
        const rawStart = (stripeSub as any).current_period_start ?? item?.current_period_start
        const rawEnd   = (stripeSub as any).current_period_end   ?? item?.current_period_end
        periodStart = rawStart ? new Date(rawStart * 1000).toISOString() : null
        periodEnd   = rawEnd   ? new Date(rawEnd   * 1000).toISOString() : null
      } catch { /* non-fatal */ }
    }

    // Resolve the placeholder "Custom Plan" id when applicable — every custom
    // total is unique (built via price_data), so there's no shared plans row
    // to look the numbers up from; they travel as session metadata instead.
    let resolvedPlanId = planId ?? null
    if (isCustom) {
      const { data: customPlanRow } = await (supabase as any)
        .from('plans')
        .select('id')
        .eq('plan_type', 'custom')
        .single()
      resolvedPlanId = (customPlanRow as { id: string } | null)?.id ?? null
      if (!resolvedPlanId) {
        return NextResponse.json({ error: { message: 'Custom plan is not configured yet.' } }, { status: 500 })
      }
    }

    // Capture any pre-existing (different) subscription BEFORE we overwrite
    // it below — needed for the upgrade-trap proration/cancel step.
    const { data: existingSub } = await (supabase as any)
      .from('subscriptions')
      .select('stripe_sub_id')
      .eq('business_id', businessId)
      .maybeSingle()
    const oldStripeSubId = (existingSub as { stripe_sub_id: string | null } | null)?.stripe_sub_id ?? null

    // Activate business
    await (supabase as any)
      .from('businesses')
      .update({
        is_active:              true,
        stripe_customer_id:     session.customer ?? null,
        stripe_subscription_id: stripeSubId,
        trial_ends_at:          null,
      })
      .eq('id', businessId)

    const inventoryStr = session.metadata?.customInventory
    const repairStr    = session.metadata?.customRepair

    // Upsert subscription (idempotent — safe if webhook already ran)
    await SubscriptionSyncService.upsert({
      businessId,
      planId: resolvedPlanId!,
      stripeSubId,
      stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
      status: 'active',
      trialEndsAt: null,
      currentPeriodStart: periodStart,
      currentPeriodEnd:   periodEnd,
      livemode: session.livemode,
      ...(isCustom
        ? {
            customOverrides: {
              maxBranches:  Number(session.metadata?.customBranches ?? 1),
              maxUsers:     Number(session.metadata?.customStaff ?? 5),
              maxProducts:  inventoryStr === 'unlimited' ? null : Number(inventoryStr),
              maxServices:  repairStr === 'unlimited' ? null : Number(repairStr),
              priceMonthly: Number(session.metadata?.customPricePence ?? 0) / 100,
            },
          }
        : {}),
    })

    // Bust Next.js data cache so module configs serve the new plan immediately
    await invalidateBusinessCache(businessId)

    // ── Upgrade-trap fix (same idempotency key scheme as the webhook, so
    // whichever of the two routes runs first performs the credit/cancel and
    // the other is a safe no-op) ──────────────────────────────────────────
    if (oldStripeSubId && oldStripeSubId !== stripeSubId) {
      try {
        const oldSub = await stripe.subscriptions.retrieve(oldStripeSubId, { expand: ['items'] })
        const oldItem = oldSub.items?.data?.[0] as any
        const oldRawStart = (oldSub as any).current_period_start ?? oldItem?.current_period_start
        const oldRawEnd   = (oldSub as any).current_period_end   ?? oldItem?.current_period_end
        const oldUnitAmount = oldItem?.price?.unit_amount ?? 0
        const customerId = typeof session.customer === 'string'
          ? session.customer
          : (typeof oldSub.customer === 'string' ? oldSub.customer : null)

        if (oldRawStart && oldRawEnd && oldUnitAmount > 0 && customerId) {
          const startMs = oldRawStart * 1000
          const endMs   = oldRawEnd * 1000
          const totalMs = endMs - startMs
          const unusedFraction = totalMs > 0 ? Math.max(0, Math.min(1, (endMs - Date.now()) / totalMs)) : 0
          const creditPence = Math.round(oldUnitAmount * unusedFraction)

          if (creditPence > 0) {
            await stripe.customers.createBalanceTransaction(
              customerId,
              {
                amount: -creditPence,
                currency: oldSub.currency ?? 'gbp',
                description: 'Unused time credit from previous plan',
              },
              { idempotencyKey: `prorate_credit_${oldStripeSubId}_${session.id}` }
            )
          }
        }

        await stripe.subscriptions.cancel(oldStripeSubId)
      } catch (err) {
        console.error('[verify-upgrade] upgrade-trap proration/cancel failed for', oldStripeSubId, err)
      }
    }

    const { data: plan } = await (supabase as any)
      .from('plans')
      .select('name, plan_type, features')
      .eq('id', resolvedPlanId)
      .single()

    // Fire subscription confirmation emails (owner + super-admin).
    // Intentionally NOT awaited — email delivery must never block the UI response.
    SubscriptionEmailService.sendNewSubscriptionEmails(businessId, resolvedPlanId!, periodEnd)

    return NextResponse.json({ data: { success: true, plan } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
