import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/backend/config/supabase'
import { activateFromCheckoutSession } from '@/backend/services/plan-checkout.service'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

/**
 * GET /api/auth/check-registration?session_id=cs_...
 *
 * Polled by /register/success after the new business pays in Stripe Checkout.
 * The account already exists (created by /api/auth/register with an
 * 'incomplete' subscription); this confirms payment directly with Stripe and
 * activates the subscription without waiting for the webhook (which does the
 * same thing as a backup).
 *
 * Public by design: the Checkout session id is unguessable, and we only ever
 * activate the business named in the session's own metadata after Stripe
 * reports it paid.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const businessId = session.metadata?.businessId
    if (session.metadata?.source !== 'signup' || !businessId) {
      return NextResponse.json({ error: 'Not a registration session' }, { status: 400 })
    }

    // Not paid yet — user may still be on the checkout page
    const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required'
    if (!paid || session.status !== 'complete') {
      return NextResponse.json({ data: { status: 'pending' } })
    }

    const supabase = createAdminClient()
    const stripeSubId = typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as Stripe.Subscription | null)?.id ?? null

    // Skip if already activated (webhook got there first, or page reloaded) —
    // avoids re-sending the subscription confirmation emails.
    const { data: sub } = await (supabase as any)
      .from('subscriptions')
      .select('status, stripe_sub_id')
      .eq('business_id', businessId)
      .maybeSingle()
    const alreadyActive = sub?.status === 'active' && stripeSubId && sub.stripe_sub_id === stripeSubId
    if (!alreadyActive) {
      await activateFromCheckoutSession(session)
    }

    const { data: business } = await (supabase as any)
      .from('businesses')
      .select('subdomain, email')
      .eq('id', businessId)
      .single()

    return NextResponse.json({
      data: { status: 'ready', subdomain: business?.subdomain ?? null, email: business?.email ?? null },
    })
  } catch (err) {
    console.error('[check-registration]', err instanceof Error ? err.message : err)
    return NextResponse.json({ data: { status: 'pending' } })
  }
}
