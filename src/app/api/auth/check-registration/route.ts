import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '@/backend/config/supabase'
import { AuthService } from '@/backend/services/auth.service'
import { EmailService } from '@/backend/services/email.service'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

/**
 * GET /api/auth/check-registration?session_id=cs_test_...
 *
 * Polled by the success page after Stripe checkout. This endpoint is the
 * PRIMARY account-creation path — it confirms payment directly with Stripe
 * and creates the account inline if needed. The webhook is a backup.
 *
 * Flow:
 *  1. If no pending record → account already exists (webhook got there first).
 *     Look up by email and return subdomain.
 *  2. If pending record exists → verify Stripe session is paid.
 *     If paid: create account here, clean up pending row, return ready.
 *     If not paid yet: return pending (user hasn't completed checkout).
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    // 1. Check if a pending registration exists for this session
    const { data: pending } = await (supabase as any)
      .from('pending_registrations')
      .select('*')
      .eq('stripe_session_id', sessionId)
      .maybeSingle()

    // ── No pending row: webhook already created the account ──────────────────
    if (!pending) {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      const email = session.customer_email ?? session.customer_details?.email

      if (!email) {
        return NextResponse.json({ data: { status: 'pending' } })
      }

      const { data: business } = await (supabase as any)
        .from('businesses')
        .select('subdomain')
        .eq('email', email)
        .eq('is_active', true)
        .maybeSingle()

      if (!business?.subdomain) {
        return NextResponse.json({ data: { status: 'pending' } })
      }

      return NextResponse.json({ data: { status: 'ready', subdomain: business.subdomain } })
    }

    // ── Pending row found: verify payment with Stripe directly ───────────────
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    // Session not yet paid — user may still be on the checkout page
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return NextResponse.json({ data: { status: 'pending' } })
    }

    // Payment confirmed — create the account now (don't wait for webhook)
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

    // Store Stripe IDs on the business
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as Stripe.Subscription)?.id ?? null

    await (supabase as any)
      .from('businesses')
      .update({
        stripe_customer_id:     session.customer ?? null,
        stripe_subscription_id: subscriptionId,
      })
      .eq('id', business.id)

    // Create subscription record
    if (pending.plan_id) {
      await (supabase as any)
        .from('subscriptions')
        .insert({
          business_id:        business.id,
          plan_id:            pending.plan_id,
          stripe_sub_id:      subscriptionId,
          stripe_customer_id: session.customer ?? null,
          status:             'trialing',
          billing_cycle:      'monthly',
          trial_ends_at:      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
    }

    // Send welcome email (non-blocking)
    EmailService.sendWelcome({
      to:           pending.email,
      fullName:     pending.full_name,
      businessName: pending.business_name,
      subdomain:    pending.subdomain,
      password:     '(the password you set during registration)',
      planName:     'your plan',
    }).catch((err: unknown) => console.error('[check-registration] Welcome email failed:', err))

    // Delete pending record — sensitive data cleanup
    await (supabase as any)
      .from('pending_registrations')
      .delete()
      .eq('id', pending.id)

    return NextResponse.json({ data: { status: 'ready', subdomain: business.subdomain } })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[check-registration]', msg)

    // If account creation failed because it already exists (e.g. webhook raced us),
    // look up the existing business and return ready.
    if (msg.includes('already taken') || msg.includes('already been registered') || msg.includes('already exists')) {
      try {
        const supabase = createAdminClient()
        const session = await stripe.checkout.sessions.retrieve(sessionId)
        const email = session.customer_email ?? session.customer_details?.email
        if (email) {
          const { data: business } = await (supabase as any)
            .from('businesses')
            .select('subdomain')
            .eq('email', email)
            .eq('is_active', true)
            .maybeSingle()

          if (business?.subdomain) {
            // Clean up pending row if it still exists
            const { data: pending } = await (supabase as any)
              .from('pending_registrations')
              .select('id')
              .eq('stripe_session_id', sessionId)
              .maybeSingle()
            if (pending) {
              await (supabase as any)
                .from('pending_registrations')
                .delete()
                .eq('id', pending.id)
            }
            return NextResponse.json({ data: { status: 'ready', subdomain: business.subdomain } })
          }
        }
      } catch {
        // fall through
      }
    }

    return NextResponse.json({ data: { status: 'pending' } })
  }
}
