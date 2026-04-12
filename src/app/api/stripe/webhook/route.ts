import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAdminSupabase } from '@/backend/config/supabase'
import { AuthService } from '@/backend/services/auth.service'
import { EmailService } from '@/backend/services/email.service'
import { SubscriptionSyncService } from '@/backend/services/subscription-sync.service'
import { invalidateBusinessCache } from '@/backend/services/module-config.service'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

// ── Helpers ──────────────────────────────────────────────────────────────────

function ts(unix: number | null | undefined): string | null {
  return unix ? new Date(unix * 1000).toISOString() : null
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

    const supabase = getAdminSupabase()

    // ── Upgrade path ─────────────────────────────────────────────────────────
    if (businessId && planId && !pendingId) {
      const stripeSubId = typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as Stripe.Subscription | null)?.id ?? null

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
          periodStart = ts(stripeSub.current_period_start)
          periodEnd   = ts(stripeSub.current_period_end)
        } catch { /* non-fatal */ }
      }

      await SubscriptionSyncService.upsert({
        businessId,
        planId,
        stripeSubId,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
        status: 'active',
        trialEndsAt: null,
        currentPeriodStart: periodStart,
        currentPeriodEnd:   periodEnd,
      })

      // Bust Next.js data cache so module configs reflect the new plan immediately
      await invalidateBusinessCache(businessId)

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
        await SubscriptionSyncService.upsert({
          businessId:       newBusinessId,
          planId:           pending.plan_id,
          stripeSubId,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
          status:           'trialing',
          trialEndsAt:      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
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

    // Update business.is_active based on status
    await supabase
      .from('businesses')
      .update({ is_active: !['canceled', 'past_due'].includes(dbStatus) })
      .eq('id', businessId)

    await SubscriptionSyncService.upsert({
      businessId,
      planId:           resolvedPlanId,
      stripeSubId:      stripeSub.id,
      stripeCustomerId: typeof stripeSub.customer === 'string' ? stripeSub.customer : null,
      status:           dbStatus,
      trialEndsAt:      stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
      currentPeriodStart: ts(stripeSub.current_period_start),
      currentPeriodEnd:   ts(stripeSub.current_period_end),
    })

    await invalidateBusinessCache(businessId)

    return NextResponse.json({ received: true })
  }

  // ── invoice.payment_succeeded ───────────────────────────────────────────────
  // Fires on every successful charge (initial + renewals).
  // Updates current_period_end so the "Renews on" date in Account page is correct.
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
    }

    return NextResponse.json({ received: true })
  }

  // ── customer.subscription.deleted ──────────────────────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const stripeSub  = event.data.object as Stripe.Subscription
    const businessId = stripeSub.metadata?.businessId
      ?? await SubscriptionSyncService.businessIdFromStripeSubId(stripeSub.id)

    if (businessId) {
      await SubscriptionSyncService.deactivate(businessId)
      await invalidateBusinessCache(businessId)
    }

    return NextResponse.json({ received: true })
  }

  return NextResponse.json({ received: true })
}

// Required type — used inside the subscription.updated handler
type SubscriptionPayload = Parameters<typeof SubscriptionSyncService.upsert>[0]
