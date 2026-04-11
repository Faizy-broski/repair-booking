import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAdminSupabase } from '@/backend/config/supabase'
import { AuthService } from '@/backend/services/auth.service'
import { EmailService } from '@/backend/services/email.service'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig  = request.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Webhook signature verification failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const pendingId  = session.metadata?.pendingId
    let businessId   = session.metadata?.businessId   // present on upgrade flow
    const planId     = session.metadata?.planId

    const supabase = getAdminSupabase()

    // ── Upgrade path (existing business) ─────────────────────────────────────
    if (businessId && !pendingId) {
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription as Stripe.Subscription)?.id ?? null

      // Activate business + update Stripe IDs
      await (supabase as any)
        .from('businesses')
        .update({
          is_active:              true,
          stripe_customer_id:     session.customer ?? null,
          stripe_subscription_id: subscriptionId,
          trial_ends_at:          null, // clear trial on upgrade
        })
        .eq('id', businessId)

      // Upsert subscription row to active
      if (planId) {
        await (supabase as any)
          .from('subscriptions')
          .upsert(
            {
              business_id:        businessId,
              plan_id:            planId,
              stripe_sub_id:      subscriptionId,
              stripe_customer_id: session.customer ?? null,
              status:             'active',
              billing_cycle:      'monthly',
              trial_ends_at:      null,
            },
            { onConflict: 'business_id' }
          )
      }

      return NextResponse.json({ received: true })
    }

    // ── New registration path (pending_registrations) ─────────────────────────
    if (!pendingId) {
      console.error('[webhook] Missing pendingId in session metadata')
      return NextResponse.json({ error: 'Missing pendingId in metadata' }, { status: 400 })
    }

    // 1. Look up the pending registration
    const { data: pending, error: pendingErr } = await (supabase as any)
      .from('pending_registrations')
      .select('*')
      .eq('id', pendingId)
      .single()

    if (pendingErr || !pending) {
      console.error('[webhook] Pending registration not found:', pendingId)
      // Return 200 to prevent Stripe retrying — registration may have already been processed
      return NextResponse.json({ received: true })
    }

    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : (session.subscription as Stripe.Subscription)?.id ?? null

    businessId = null

    try {
      // 2. Create the account (user + business [is_active:true] + branch + profile)
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
      businessId = business.id
    } catch (regErr) {
      const msg = regErr instanceof Error ? regErr.message : 'Registration failed'

      // Account already created by check-registration polling (race condition is expected).
      // Look up the existing business so we can still update Stripe IDs.
      if (msg.includes('already taken') || msg.includes('already been registered') || msg.includes('already exists')) {
        const { data: existingBiz } = await (supabase as any)
          .from('businesses')
          .select('id')
          .eq('email', pending.email)
          .maybeSingle()
        businessId = existingBiz?.id ?? null
        console.log('[webhook] Account already exists, updating Stripe IDs for:', pending.email)
      } else {
        console.error('[webhook] Account creation failed:', msg)
        // Return 200 so Stripe doesn't retry infinitely — admin must resolve manually
        return NextResponse.json({ received: true })
      }
    }

    if (businessId) {
      // 3. Store the Stripe subscription + customer on the business
      await (supabase as any)
        .from('businesses')
        .update({
          stripe_customer_id:     session.customer ?? null,
          stripe_subscription_id: subscriptionId,
        })
        .eq('id', businessId)

      // 4. Upsert subscription record (safe to re-run if check-registration already inserted)
      if (pending.plan_id) {
        await (supabase as any)
          .from('subscriptions')
          .upsert(
            {
              business_id:        businessId,
              plan_id:            pending.plan_id,
              stripe_sub_id:      subscriptionId,
              stripe_customer_id: session.customer ?? null,
              status:             'trialing',
              billing_cycle:      'monthly',
              trial_ends_at:      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            },
            { onConflict: 'business_id' }
          )
      }
    }

    // 5. Send welcome email (non-blocking, best-effort — check-registration may have sent it already)
    EmailService.sendWelcome({
      to:           pending.email,
      fullName:     pending.full_name,
      businessName: pending.business_name,
      subdomain:    pending.subdomain,
      password:     '(the password you set during registration)',
      planName:     'your plan',
    }).catch((emailErr: unknown) => console.error('[webhook] Welcome email failed:', emailErr))

    // 6. Delete the pending registration (cleanup sensitive data)
    await (supabase as any)
      .from('pending_registrations')
      .delete()
      .eq('id', pendingId)
  }

  if (event.type === 'customer.subscription.deleted') {
    // Deactivate business when subscription is cancelled
    const subscription = event.data.object as Stripe.Subscription
    const businessId = subscription.metadata?.businessId
    if (businessId) {
      await (getAdminSupabase() as any)
        .from('businesses')
        .update({ is_active: false })
        .eq('id', businessId)
    }
  }

  return NextResponse.json({ received: true })
}
