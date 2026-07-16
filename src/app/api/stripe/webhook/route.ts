import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAdminSupabase } from '@/backend/config/supabase'
import { AuthService } from '@/backend/services/auth.service'
import { EmailService } from '@/backend/services/email.service'
import { SubscriptionSyncService } from '@/backend/services/subscription-sync.service'
import { invalidateBusinessCache } from '@/backend/services/module-config.service'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'repairbooking.co.uk'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

// ── Helpers ──────────────────────────────────────────────────────────────────

function ts(unix: number | null | undefined): string | null {
  return unix ? new Date(unix * 1000).toISOString() : null
}

// In Stripe API >= 2026-02-25 (Clover), current_period_start/end moved from
// the subscription root to each subscription item. Read both locations.
function subPeriod(stripeSub: Stripe.Subscription): { start: string | null; end: string | null } {
  const rootStart = (stripeSub as any).current_period_start as number | undefined
  const rootEnd   = (stripeSub as any).current_period_end   as number | undefined
  const item = stripeSub.items?.data?.[0] as any
  const start = rootStart ?? item?.current_period_start ?? null
  const end   = rootEnd   ?? item?.current_period_end   ?? null
  return { start: ts(start), end: ts(end) }
}

// ── Webhook handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig  = request.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook signature verification failed'
    console.error('[webhook] Signature error:', msg)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  console.log(`[webhook] ${event.type}`)

  // ── checkout.session.completed ──────────────────────────────────────────────
  // Fires for both new registrations (pendingId in metadata) and plan upgrades
  // (businessId in metadata). For upgrades this is the primary event that
  // updates the subscription row.
  if (event.type === 'checkout.session.completed') {
    const session   = event.data.object as Stripe.Checkout.Session
    const pendingId = session.metadata?.pendingId
    const businessId = session.metadata?.businessId
    const planId     = session.metadata?.planId
    const isCustom   = session.metadata?.isCustom === 'true'

    const supabase = getAdminSupabase()

    // ── Custom Plan upgrade path ─────────────────────────────────────────────
    // Every custom total is unique (built via price_data, not a shared Price),
    // so there's no shared plans row to look the numbers up from — they travel
    // as session/subscription metadata instead.
    if (businessId && isCustom && !pendingId) {
      const stripeSubId = typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as Stripe.Subscription | null)?.id ?? null

      const { data: customPlanRow } = await (supabase as any)
        .from('plans')
        .select('id')
        .eq('plan_type', 'custom')
        .single()
      const customPlanId = (customPlanRow as { id: string } | null)?.id

      if (!customPlanId) {
        console.error('[webhook] custom checkout completed but no custom plan placeholder row exists')
        return NextResponse.json({ received: true })
      }

      // Capture any pre-existing (different) subscription BEFORE we overwrite
      // it below — needed for the upgrade-trap proration/cancel step.
      const { data: existingSub } = await (supabase as any)
        .from('subscriptions')
        .select('stripe_sub_id')
        .eq('business_id', businessId)
        .maybeSingle()
      const oldStripeSubId = (existingSub as { stripe_sub_id: string | null } | null)?.stripe_sub_id ?? null

      await (supabase as any)
        .from('businesses')
        .update({
          is_active:              true,
          stripe_customer_id:     session.customer ?? null,
          stripe_subscription_id: stripeSubId,
          trial_ends_at:          null,
        })
        .eq('id', businessId)

      let periodStart: string | null = null
      let periodEnd: string | null = null
      if (stripeSubId) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubId)
          const period = subPeriod(stripeSub)
          periodStart = period.start
          periodEnd   = period.end
        } catch { /* non-fatal */ }
      }

      const inventoryStr = session.metadata?.customInventory
      const repairStr    = session.metadata?.customRepair
      const billingCycle = session.metadata?.billingCycle === 'yearly' ? 'yearly' : 'monthly'

      await SubscriptionSyncService.upsert({
        businessId,
        planId: customPlanId,
        stripeSubId,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
        status: 'active',
        trialEndsAt: null,
        currentPeriodStart: periodStart,
        currentPeriodEnd:   periodEnd,
        livemode: event.livemode,
        billingCycle,
        customOverrides: {
          maxBranches:  Number(session.metadata?.customBranches ?? 1),
          maxUsers:     Number(session.metadata?.customStaff ?? 5),
          maxProducts:  inventoryStr === 'unlimited' ? null : Number(inventoryStr),
          maxServices:  repairStr === 'unlimited' ? null : Number(repairStr),
          priceMonthly: Number(session.metadata?.customPricePence ?? 0) / 100,
        },
      })

      await invalidateBusinessCache(businessId)

      // ── Upgrade-trap fix ─────────────────────────────────────────────────
      // Stripe Checkout with price_data always creates a brand-new
      // subscription — it cannot attach to an existing one. If this business
      // was already on a different, active paid subscription, credit the
      // unused time on their Stripe customer balance (applied automatically
      // to their *next* invoice — the current one is already finalized as
      // part of this Checkout) before canceling the old subscription, so
      // they aren't double-billed and don't forfeit unused value.
      if (oldStripeSubId && oldStripeSubId !== stripeSubId) {
        try {
          const oldSub = await stripe.subscriptions.retrieve(oldStripeSubId, { expand: ['items'] })
          const oldPeriod = subPeriod(oldSub)
          const oldUnitAmount = oldSub.items?.data?.[0]?.price?.unit_amount ?? 0
          const customerId = typeof session.customer === 'string'
            ? session.customer
            : (typeof oldSub.customer === 'string' ? oldSub.customer : null)

          if (oldPeriod.start && oldPeriod.end && oldUnitAmount > 0 && customerId) {
            const startMs = new Date(oldPeriod.start).getTime()
            const endMs   = new Date(oldPeriod.end).getTime()
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
                // Idempotent: a retried webhook delivery must not double-credit.
                { idempotencyKey: `prorate_credit_${oldStripeSubId}_${session.id}` }
              )
            }
          }

          await stripe.subscriptions.cancel(oldStripeSubId)
        } catch (err) {
          console.error('[webhook] upgrade-trap proration/cancel failed for', oldStripeSubId, err)
        }
      }

      return NextResponse.json({ received: true })
    }

    // ── Upgrade path ─────────────────────────────────────────────────────────
    if (businessId && planId && !pendingId) {
      const stripeSubId = typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as Stripe.Subscription | null)?.id ?? null

      // Capture any pre-existing (different) subscription BEFORE we overwrite
      // it below — needed for the upgrade-trap proration/cancel step, same as
      // the Custom Plan path above.
      const { data: existingSub } = await (supabase as any)
        .from('subscriptions')
        .select('stripe_sub_id')
        .eq('business_id', businessId)
        .maybeSingle()
      const oldStripeSubId = (existingSub as { stripe_sub_id: string | null } | null)?.stripe_sub_id ?? null

      // Activate business + clear trial
      await (supabase as any)
        .from('businesses')
        .update({
          is_active:              true,
          stripe_customer_id:     session.customer ?? null,
          stripe_subscription_id: stripeSubId,
          trial_ends_at:          null,
        })
        .eq('id', businessId)

      // Resolve period dates from the Stripe subscription if available
      let periodStart: string | null = null
      let periodEnd: string | null = null
      if (stripeSubId) {
        try {
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubId)
          const period = subPeriod(stripeSub)
          periodStart = period.start
          periodEnd   = period.end
        } catch { /* non-fatal */ }
      }

      const billingCycle = session.metadata?.billingCycle === 'yearly' ? 'yearly' : 'monthly'

      await SubscriptionSyncService.upsert({
        businessId,
        planId,
        stripeSubId,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
        status: 'active',
        trialEndsAt: null,
        currentPeriodStart: periodStart,
        currentPeriodEnd:   periodEnd,
        livemode: event.livemode,
        billingCycle,
      })

      // Bust Next.js data cache so module configs reflect the new plan immediately
      await invalidateBusinessCache(businessId)

      // ── Upgrade-trap fix ─────────────────────────────────────────────────
      // Stripe Checkout always creates a brand-new subscription — it cannot
      // attach to an existing one. If this business was already on a
      // different, active paid subscription, credit the unused time on their
      // Stripe customer balance before canceling the old subscription, so
      // they aren't double-billed and don't forfeit unused value. Mirrors
      // the Custom Plan path's identical block above.
      if (oldStripeSubId && oldStripeSubId !== stripeSubId) {
        try {
          const oldSub = await stripe.subscriptions.retrieve(oldStripeSubId, { expand: ['items'] })
          const oldPeriod = subPeriod(oldSub)
          const oldUnitAmount = oldSub.items?.data?.[0]?.price?.unit_amount ?? 0
          const customerId = typeof session.customer === 'string'
            ? session.customer
            : (typeof oldSub.customer === 'string' ? oldSub.customer : null)

          if (oldPeriod.start && oldPeriod.end && oldUnitAmount > 0 && customerId) {
            const startMs = new Date(oldPeriod.start).getTime()
            const endMs   = new Date(oldPeriod.end).getTime()
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
                // Idempotent: a retried webhook delivery must not double-credit.
                { idempotencyKey: `prorate_credit_${oldStripeSubId}_${session.id}` }
              )
            }
          }

          await stripe.subscriptions.cancel(oldStripeSubId)
        } catch (err) {
          console.error('[webhook] upgrade-trap proration/cancel failed for', oldStripeSubId, err)
        }
      }

      return NextResponse.json({ received: true })
    }

    // ── New registration path ─────────────────────────────────────────────────
    if (!pendingId) {
      console.error('[webhook] Missing pendingId and businessId in session metadata')
      return NextResponse.json({ received: true }) // 200 so Stripe stops retrying
    }

    const { data: pending, error: pendingErr } = await (supabase as any)
      .from('pending_registrations')
      .select('*')
      .eq('id', pendingId)
      .single()

    if (pendingErr || !pending) {
      console.warn('[webhook] Pending registration not found (may be already processed):', pendingId)
      return NextResponse.json({ received: true })
    }

    const stripeSubId = typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? null

    let newBusinessId: string | null = null
    try {
      const { business } = await AuthService.register({
        businessName:   pending.business_name,
        subdomain:      pending.subdomain,
        email:          pending.email,
        phone:          pending.phone ?? undefined,
        fullName:       pending.full_name,
        password:       pending.password_temp,
        mainBranchName: pending.main_branch_name,
        activateNow:    true,
      })
      newBusinessId = business.id
    } catch (regErr) {
      const msg = regErr instanceof Error ? regErr.message : 'Registration failed'
      if (msg.includes('already taken') || msg.includes('already been registered') || msg.includes('already exists')) {
        const { data: existingBiz } = await (supabase as any)
          .from('businesses').select('id').eq('email', pending.email).maybeSingle()
        newBusinessId = existingBiz?.id ?? null
        console.log('[webhook] Account already exists:', pending.email)
      } else {
        console.error('[webhook] Account creation failed:', msg)
        return NextResponse.json({ received: true })
      }
    }

    if (newBusinessId) {
      await (supabase as any)
        .from('businesses')
        .update({ stripe_customer_id: session.customer ?? null, stripe_subscription_id: stripeSubId })
        .eq('id', newBusinessId)

      if (pending.plan_id) {
        // Read the actual trial_end from Stripe so our DB matches exactly
        let trialEndsAt: string | null = null
        if (stripeSubId) {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(stripeSubId)
            trialEndsAt = stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null
          } catch { /* non-fatal */ }
        }
        await SubscriptionSyncService.upsert({
          businessId:       newBusinessId,
          planId:           pending.plan_id,
          stripeSubId,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
          status:           'trialing',
          trialEndsAt,
          livemode:         event.livemode,
        })
      }
    }

    EmailService.sendWelcome({
      to: pending.email, fullName: pending.full_name, businessName: pending.business_name,
      subdomain: pending.subdomain, password: '(the password you set during registration)', planName: 'your plan',
    }).catch((e: unknown) => console.error('[webhook] Welcome email failed:', e))

    await (supabase as any).from('pending_registrations').delete().eq('id', pendingId)
    return NextResponse.json({ received: true })
  }

  // ── customer.subscription.updated ──────────────────────────────────────────
  // Fires when a subscription's plan, status, or billing dates change —
  // including plan upgrades made via Stripe Customer Portal.
  if (event.type === 'customer.subscription.updated') {
    const stripeSub  = event.data.object as Stripe.Subscription
    const businessId = stripeSub.metadata?.businessId
      ?? await SubscriptionSyncService.businessIdFromStripeSubId(stripeSub.id)

    if (!businessId) {
      console.warn('[webhook] subscription.updated: no businessId for', stripeSub.id)
      return NextResponse.json({ received: true })
    }

    // Resolve our internal planId from the Stripe price on the subscription
    const priceId = stripeSub.items.data[0]?.price?.id ?? null
    const planId  = priceId
      ? await SubscriptionSyncService.planIdFromStripePrice(priceId)
      : null

    // If we don't recognise the price, keep the existing planId
    const supabase = getAdminSupabase() as any
    const { data: existing } = await supabase
      .from('subscriptions').select('plan_id').eq('business_id', businessId).maybeSingle()

    const resolvedPlanId = planId ?? existing?.plan_id
    if (!resolvedPlanId) {
      console.warn('[webhook] subscription.updated: unknown price, no fallback planId', priceId)
      return NextResponse.json({ received: true })
    }

    const stripeStatus = stripeSub.status as 'active' | 'trialing' | 'past_due' | 'canceled'
    const dbStatus: SubscriptionPayload['status'] =
      ['active', 'trialing', 'past_due', 'canceled'].includes(stripeStatus) ? stripeStatus : 'active'

    // Deactivate only on hard cancellation — past_due keeps access so the owner
    // can log in, see the warning, and fix their payment method.
    await supabase
      .from('businesses')
      .update({ is_active: dbStatus !== 'canceled' })
      .eq('id', businessId)

    await SubscriptionSyncService.upsert({
      businessId,
      planId:           resolvedPlanId,
      stripeSubId:      stripeSub.id,
      stripeCustomerId: typeof stripeSub.customer === 'string' ? stripeSub.customer : null,
      status:           dbStatus,
      trialEndsAt:      stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
      currentPeriodStart: subPeriod(stripeSub).start,
      currentPeriodEnd:   subPeriod(stripeSub).end,
      livemode:         event.livemode,
    })

    await invalidateBusinessCache(businessId)

    return NextResponse.json({ received: true })
  }

  // ── invoice.payment_succeeded ───────────────────────────────────────────────
  // Fires on every successful charge (initial + renewals).
  // Updates current_period_end and re-activates the business in case a prior
  // invoice.payment_failed had put it into past_due.
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    const stripeSubId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : (invoice.subscription as Stripe.Subscription | null)?.id ?? null

    if (stripeSubId) {
      const lines = (invoice as any).lines?.data?.[0]
      await SubscriptionSyncService.updatePeriod({
        stripeSubId,
        status: 'active',
        currentPeriodStart: ts(lines?.period?.start),
        currentPeriodEnd:   ts(lines?.period?.end),
      })

      // Re-activate the business in case a prior payment failure deactivated it.
      const businessId = await SubscriptionSyncService.businessIdFromStripeSubId(stripeSubId)
      if (businessId) {
        const supabase = getAdminSupabase() as any
        await supabase.from('businesses').update({ is_active: true }).eq('id', businessId)
        await invalidateBusinessCache(businessId)
      }
    }

    return NextResponse.json({ received: true })
  }

  // ── invoice.payment_failed ─────────────────────────────────────────────────
  // Fires on every failed charge attempt (Stripe retries up to 4 times by default).
  // We mark the subscription past_due and email the owner — but do NOT deactivate
  // the business. The owner keeps access so they can log in and fix their card.
  // Access is only fully revoked when the subscription reaches 'canceled' status
  // (after all retries are exhausted), handled by customer.subscription.deleted.
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice
    const stripeSubId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : (invoice.subscription as Stripe.Subscription | null)?.id ?? null

    if (!stripeSubId) return NextResponse.json({ received: true })

    const businessId = await SubscriptionSyncService.businessIdFromStripeSubId(stripeSubId)
    if (!businessId) {
      console.warn('[webhook] invoice.payment_failed: no businessId for sub', stripeSubId)
      return NextResponse.json({ received: true })
    }

    const supabase = getAdminSupabase() as any

    // Mark subscription past_due in our DB (subscription.updated may also fire, this is a belt-and-suspenders update)
    await supabase
      .from('subscriptions')
      .update({ status: 'past_due' })
      .eq('stripe_sub_id', stripeSubId)

    // Fetch business contact details for the email
    const { data: business } = await supabase
      .from('businesses')
      .select('email, name, subdomain')
      .eq('id', businessId)
      .single()

    if (business?.email) {
      const attemptCount: number = (invoice as any).attempt_count ?? 1
      const nextAttemptUnix: number | null = (invoice as any).next_payment_attempt ?? null
      const nextAttemptAt = nextAttemptUnix ? new Date(nextAttemptUnix * 1000).toISOString() : null

      EmailService.sendPaymentFailed({
        to:            business.email,
        businessName:  business.name,
        subdomain:     business.subdomain,
        amountDue:     (invoice as any).amount_due ?? 0,
        currency:      invoice.currency ?? 'gbp',
        attemptCount,
        nextAttemptAt,
      }).catch((e: unknown) => console.error('[webhook] sendPaymentFailed error:', e))
    }

    await invalidateBusinessCache(businessId)
    return NextResponse.json({ received: true })
  }

  // ── customer.subscription.deleted ──────────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const stripeSub  = event.data.object as Stripe.Subscription
    const businessId = stripeSub.metadata?.businessId
      ?? await SubscriptionSyncService.businessIdFromStripeSubId(stripeSub.id)

    if (businessId) {
      // Event-ordering guard: webhook delivery order isn't guaranteed. If this
      // business has already moved on to a newer subscription (e.g. the
      // upgrade-trap cancellation above, or any other replacement), a
      // late-arriving deletion event for the OLD subscription must not
      // deactivate the newer one it superseded.
      const supabase = getAdminSupabase() as any
      const { data: currentSub } = await supabase
        .from('subscriptions')
        .select('stripe_sub_id')
        .eq('business_id', businessId)
        .maybeSingle()

      if (currentSub?.stripe_sub_id && currentSub.stripe_sub_id !== stripeSub.id) {
        console.log('[webhook] subscription.deleted for a superseded subscription, ignoring:', stripeSub.id)
        return NextResponse.json({ received: true })
      }

      await SubscriptionSyncService.deactivate(businessId)
      await invalidateBusinessCache(businessId)
    }

    return NextResponse.json({ received: true })
  }

  return NextResponse.json({ received: true })
}

// Required type — used inside the subscription.updated handler
type SubscriptionPayload = Parameters<typeof SubscriptionSyncService.upsert>[0]
