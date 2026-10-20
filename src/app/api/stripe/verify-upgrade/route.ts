import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/backend/config/supabase'
import { activateFromCheckoutSession, PlanCheckoutError } from '@/backend/services/plan-checkout.service'

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

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    // Security: verify the caller belongs to the business on the session
    const supabase = createAdminClient()
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .single()

    if (!profile || !session.metadata?.businessId || profile.business_id !== session.metadata.businessId) {
      return NextResponse.json({ error: { message: 'Forbidden' } }, { status: 403 })
    }

    const { plan } = await activateFromCheckoutSession(session)

    return NextResponse.json({ data: { success: true, plan } })
  } catch (err) {
    if (err instanceof PlanCheckoutError) {
      return NextResponse.json({ error: { message: err.message } }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Verification failed'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
