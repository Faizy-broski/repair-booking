import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/backend/config/supabase'
import { SubscriptionSyncService } from '@/backend/services/subscription-sync.service'
import { invalidateBusinessCache } from '@/backend/services/module-config.service'

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
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: { message: 'Payment not completed' } }, { status: 400 })
    }

    const businessId = session.metadata?.businessId
    const planId     = session.metadata?.planId
    if (!businessId || !planId) {
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
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId)
        periodStart = stripeSub.current_period_start
          ? new Date(stripeSub.current_period_start * 1000).toISOString() : null
        periodEnd = stripeSub.current_period_end
          ? new Date(stripeSub.current_period_end * 1000).toISOString() : null
      } catch { /* non-fatal */ }
    }

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

    // Upsert subscription (idempotent — safe if webhook already ran)
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

    // Bust Next.js data cache so module configs serve the new plan immediately
    await invalidateBusinessCache(businessId)

    const { data: plan } = await (supabase as any)
      .from('plans')
      .select('name, plan_type, features')
      .eq('id', planId)
      .single()

    return NextResponse.json({ data: { success: true, plan } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
