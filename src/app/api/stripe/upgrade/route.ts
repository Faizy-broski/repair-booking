import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/backend/config/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://repairbooking.co.uk'

const schema = z.object({
  planId: z.string().uuid('planId must be a valid UUID'),
})

export async function POST(request: NextRequest) {
  try {
    // Authenticate the calling user
    const supabaseUser = await createClient()
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: { message: 'Unauthorised' } }, { status: 401 })
    }

    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: parsed.error.issues[0]?.message ?? 'Invalid request' } },
        { status: 400 }
      )
    }

    const { planId } = parsed.data
    const supabase = createAdminClient()

    // Look up business from user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('business_id, email')
      .eq('id', user.id)
      .single()

    if (!profile?.business_id) {
      return NextResponse.json({ error: { message: 'No business linked to your account' } }, { status: 400 })
    }

    const businessId = profile.business_id

    // Look up plan (cast to any — plan_type column added by migration 042)
    const { data: planRow, error: planErr } = await (supabase as any)
      .from('plans')
      .select('id, name, stripe_price_id_monthly, plan_type, price_monthly')
      .eq('id', planId)
      .eq('is_active', true)
      .single()

    const plan = planRow as { id: string; name: string; stripe_price_id_monthly: string | null; plan_type: string; price_monthly: number } | null
    if (planErr || !plan) {
      return NextResponse.json({ error: { message: 'Plan not found' } }, { status: 400 })
    }

    // Auto-create Stripe product + price if not yet configured
    let stripePriceId = plan.stripe_price_id_monthly
    if (!stripePriceId) {
      if (plan.price_monthly <= 0) {
        return NextResponse.json(
          { error: { message: `Plan "${plan.name}" has no price and no Stripe price ID configured.` } },
          { status: 500 }
        )
      }
      const product = await stripe.products.create({ name: plan.name })
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(plan.price_monthly * 100),
        currency: 'gbp',
        recurring: { interval: 'month' },
      })
      stripePriceId = price.id

      // Persist so we don't recreate next time
      await (supabase as any)
        .from('plans')
        .update({ stripe_price_id_monthly: stripePriceId })
        .eq('id', planId)
    }

    // Get existing Stripe customer ID if available (cast — stripe_customer_id from migration)
    const { data: bizRow } = await (supabase as any)
      .from('businesses')
      .select('stripe_customer_id, subdomain')
      .eq('id', businessId)
      .single()

    const business = bizRow as { stripe_customer_id?: string | null; subdomain?: string } | null
    const customerParam: Stripe.Checkout.SessionCreateParams = business?.stripe_customer_id
      ? { customer: business.stripe_customer_id }
      : { customer_email: user.email }

    const subdomain = business?.subdomain ?? ''
    const appUrlObj = new URL(APP_URL)
    const successUrl = subdomain
      ? `${appUrlObj.protocol}//${subdomain}.${appUrlObj.host}/dashboard?upgraded=1`
      : `${APP_URL}/dashboard?upgraded=1`

    // Create Stripe Checkout session for upgrade
    const session = await stripe.checkout.sessions.create({
      ...customerParam,
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      subscription_data: {
        metadata: { businessId, planId },
      },
      metadata: { businessId, planId },
      success_url: successUrl,
      cancel_url:  `${APP_URL}/upgrade`,
    } as Stripe.Checkout.SessionCreateParams)

    return NextResponse.json({ data: { url: session.url } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
