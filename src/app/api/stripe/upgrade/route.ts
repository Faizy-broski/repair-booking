import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/backend/config/supabase'
import { CUSTOM_PLAN_YEARLY_DISCOUNT } from '@/backend/services/custom-plan-pricing'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://repairbooking.co.uk'

const schema = z.object({
  planId:       z.string().uuid('planId must be a valid UUID'),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
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

    const { planId, billingCycle } = parsed.data
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

    // Look up plan — fetch the monthly price ID (still cached/reused) and
    // the raw monthly price (yearly is always derived from this, never a
    // stored price_yearly — see CUSTOM_PLAN_YEARLY_DISCOUNT).
    const { data: planRow, error: planErr } = await (supabase as any)
      .from('plans')
      .select('id, name, stripe_price_id_monthly, plan_type, price_monthly')
      .eq('id', planId)
      .eq('is_active', true)
      .single()

    const plan = planRow as {
      id: string; name: string
      stripe_price_id_monthly: string | null
      plan_type: string
      price_monthly: number
    } | null
    if (planErr || !plan) {
      return NextResponse.json({ error: { message: 'Plan not found' } }, { status: 400 })
    }
    if (plan.price_monthly <= 0) {
      return NextResponse.json(
        { error: { message: `Plan "${plan.name}" has no monthly price configured.` } },
        { status: 500 }
      )
    }

    const useYearly = billingCycle === 'yearly'

    // Yearly is always a flat 10% off the current monthly price, built as an
    // inline price_data line item — never a persisted/cached Price, so a
    // future price_monthly change (or the discount rate itself) can't leave
    // stale customers on an outdated cached yearly Price. Monthly keeps the
    // existing cached-Price-reuse pattern since its price doesn't change
    // based on billing cycle.
    let lineItem: Stripe.Checkout.SessionCreateParams.LineItem
    if (useYearly) {
      const unitAmount = Math.round(plan.price_monthly * 12 * (1 - CUSTOM_PLAN_YEARLY_DISCOUNT) * 100)
      lineItem = {
        price_data: {
          currency: 'gbp',
          product_data: { name: plan.name },
          unit_amount: unitAmount,
          recurring: { interval: 'year' },
        },
        quantity: 1,
      }
    } else {
      let stripePriceId = plan.stripe_price_id_monthly
      if (!stripePriceId) {
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
      lineItem = { price: stripePriceId, quantity: 1 }
    }

    // Get existing Stripe customer ID if available (cast — stripe_customer_id from migration)
    const { data: bizRow } = await (supabase as any)
      .from('businesses')
      .select('stripe_customer_id, subdomain')
      .eq('id', businessId)
      .single()

    const business = bizRow as { stripe_customer_id?: string | null; subdomain?: string } | null

    // Validate the stored customer ID against the current Stripe mode (test vs live).
    // A test-mode customer ID silently breaks when live keys are used, so we verify
    // first and fall back to email — clearing the stale ID so it doesn't re-poison future calls.
    let customerParam: Stripe.Checkout.SessionCreateParams
    if (business?.stripe_customer_id) {
      try {
        const existing = await stripe.customers.retrieve(business.stripe_customer_id)
        if ((existing as Stripe.DeletedCustomer).deleted) throw new Error('deleted')
        customerParam = { customer: business.stripe_customer_id }
      } catch {
        await (supabase as any)
          .from('businesses')
          .update({ stripe_customer_id: null })
          .eq('id', businessId)
        customerParam = { customer_email: user.email }
      }
    } else {
      customerParam = { customer_email: user.email }
    }

    const subdomain = business?.subdomain ?? ''
    const appUrlObj = new URL(APP_URL)
    // {CHECKOUT_SESSION_ID} is a Stripe template variable — it gets replaced with
    // the real session ID at redirect time, so we can verify the payment server-side
    // without relying on the webhook.
    const successUrl = subdomain
      ? `${appUrlObj.protocol}//${subdomain}.${appUrlObj.host}/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}`
      : `${APP_URL}/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}`

    // Create Stripe Checkout session for upgrade
    const vatTaxRateId = process.env.STRIPE_VAT_TAX_RATE_ID
    const session = await stripe.checkout.sessions.create({
      ...customerParam,
      mode: 'subscription',
      line_items: [{
        ...lineItem,
        ...(vatTaxRateId ? { tax_rates: [vatTaxRateId] } : {}),
      }],
      subscription_data: {
        metadata: { businessId, planId, billingCycle },
        ...(vatTaxRateId ? { default_tax_rates: [vatTaxRateId] } : {}),
      },
      metadata: { businessId, planId, billingCycle },
      success_url: successUrl,
      cancel_url:  `${APP_URL}/upgrade`,
    } as Stripe.Checkout.SessionCreateParams)

    return NextResponse.json({ data: { url: session.url } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
