import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/backend/config/supabase'
import { customPlanDimensionsSchema, computeCustomPlanTotalPence, getCustomPlanBaseline, type CustomPlanBillingCycle } from '@/backend/services/custom-plan-pricing'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://repairbooking.co.uk'

/**
 * POST /api/stripe/upgrade-custom
 *
 * Sibling to /api/stripe/upgrade, for a customer-built Custom Plan instead
 * of picking a fixed planId. Every custom total is unique, so this uses
 * Stripe Checkout's inline price_data (no persisted Product/Price needed)
 * rather than the "look up or auto-create a shared Price" pattern the
 * standard upgrade route uses.
 */
export async function POST(request: NextRequest) {
  try {
    const supabaseUser = await createClient()
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: { message: 'Unauthorised' } }, { status: 401 })
    }

    const supabase = createAdminClient()

    // Floors/steps depend on the current cheapest paid plan's live values —
    // never hardcode them, and never trust the client's raw numbers without
    // re-validating against them.
    const baseline = await getCustomPlanBaseline(supabase)

    const body = await request.json()
    const parsed = customPlanDimensionsSchema(baseline).safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: parsed.error.issues[0]?.message ?? 'Invalid request' } },
        { status: 400 }
      )
    }
    const dims = parsed.data
    const billingCycle: CustomPlanBillingCycle = body.billingCycle === 'yearly' ? 'yearly' : 'monthly'

    // Never trust a client-sent total — recompute here, in pence, from the
    // raw dimension values. This is what actually gets sent to Stripe. For
    // 'yearly' this is the full annual charge (10% off), not a
    // monthly-equivalent — see computeCustomPlanTotalPence.
    const totalPence = computeCustomPlanTotalPence(dims, baseline, billingCycle)

    const { data: profile } = await supabase
      .from('profiles')
      .select('business_id, email')
      .eq('id', user.id)
      .single()

    if (!profile?.business_id) {
      return NextResponse.json({ error: { message: 'No business linked to your account' } }, { status: 400 })
    }

    const businessId = profile.business_id

    const { data: bizRow } = await (supabase as any)
      .from('businesses')
      .select('stripe_customer_id, subdomain')
      .eq('id', businessId)
      .single()

    const business = bizRow as { stripe_customer_id?: string | null; subdomain?: string } | null

    // Validate the stored customer ID against the current Stripe mode (test vs live) —
    // same pattern as /api/stripe/upgrade/route.ts.
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
    const successUrl = subdomain
      ? `${appUrlObj.protocol}//${subdomain}.${appUrlObj.host}/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}`
      : `${APP_URL}/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}`

    const vatTaxRateId = process.env.STRIPE_VAT_TAX_RATE_ID

    // Dimension values are passed through as metadata (strings) so the
    // checkout.session.completed webhook / verify-upgrade can write
    // is_custom + custom_* onto the subscriptions row on confirmation —
    // there's no shared plan row to look these up from.
    const customMetadata = {
      isCustom:       'true',
      customBranches: String(dims.branches),
      customStaff:    String(dims.staff),
      customInventory: dims.inventoryLimit === null ? 'unlimited' : String(dims.inventoryLimit),
      customRepair:    dims.repairLimit === null ? 'unlimited' : String(dims.repairLimit),
      customPricePence: String(totalPence),
      billingCycle,
    }

    const session = await stripe.checkout.sessions.create({
      ...customerParam,
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: { name: 'Custom Plan' },
          unit_amount: totalPence,
          recurring: { interval: billingCycle === 'yearly' ? 'year' : 'month' },
        },
        quantity: 1,
        ...(vatTaxRateId ? { tax_rates: [vatTaxRateId] } : {}),
      }],
      subscription_data: {
        metadata: { businessId, ...customMetadata },
        ...(vatTaxRateId ? { default_tax_rates: [vatTaxRateId] } : {}),
      },
      metadata: { businessId, ...customMetadata },
      success_url: successUrl,
      cancel_url:  `${APP_URL}/upgrade`,
    } as Stripe.Checkout.SessionCreateParams)

    return NextResponse.json({ data: { url: session.url } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
