import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAdminSupabase } from '@/backend/config/supabase'
import { EmailService } from '@/backend/services/email.service'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-03-31.basil' })
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

const PLAN_NAMES: Record<string, string> = {
  starter:    'Starter (£29/mo)',
  growth:     'Growth (£79/mo)',
  enterprise: 'Enterprise',
}

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
    const businessId = session.metadata?.businessId
    const planId     = session.metadata?.planId ?? 'starter'

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId in metadata' }, { status: 400 })
    }

    const supabase = getAdminSupabase()

    // 1. Activate business + store Stripe subscription ID + plan
    const subscriptionId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null

    const { data: business, error: bizError } = await (supabase as any)
      .from('businesses')
      .update({
        is_active:       true,
        plan:            planId,
        stripe_customer_id:     session.customer ?? null,
        stripe_subscription_id: subscriptionId,
      })
      .eq('id', businessId)
      .select('name, subdomain, email')
      .single()

    if (bizError || !business) {
      console.error('[webhook] Failed to activate business:', bizError)
      return NextResponse.json({ error: 'Failed to activate business' }, { status: 500 })
    }

    // 2. Fetch the owner profile to get name + stored password hint
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('full_name')
      .eq('business_id', businessId)
      .eq('role', 'business_owner')
      .single()

    // 3. Send welcome email with credentials
    // Note: we can't retrieve the password from Supabase (hashed), so we ask
    // them to use the password they set during registration.
    try {
      await EmailService.sendWelcome({
        to:           business.email,
        fullName:     profile?.full_name ?? 'there',
        businessName: business.name,
        subdomain:    business.subdomain,
        password:     '(the password you set during registration)',
        planName:     PLAN_NAMES[planId] ?? planId,
      })
    } catch (emailErr) {
      // Don't fail the webhook if email fails — business is already activated
      console.error('[webhook] Welcome email failed:', emailErr)
    }
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
