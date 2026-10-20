import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/backend/config/supabase'
import { customPlanDimensionsSchema, computeCustomPlanPricePence, computeCustomPlanTotalPence, getCustomPlanBaseline, type CustomPlanBillingCycle } from '@/backend/services/custom-plan-pricing'
import { createPlanCheckoutSession, PlanCheckoutError } from '@/backend/services/plan-checkout.service'

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
      .select('subdomain')
      .eq('id', businessId)
      .single()
    const subdomain = (bizRow as { subdomain?: string } | null)?.subdomain ?? ''

    const appUrlObj = new URL(APP_URL)
    const successUrl = subdomain
      ? `${appUrlObj.protocol}//${subdomain}.${appUrlObj.host}/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}`
      : `${APP_URL}/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}`

    const { url } = await createPlanCheckoutSession({
      businessId,
      email:      user.email ?? '',
      target:     { kind: 'custom', dims, totalPence, monthlyPence: computeCustomPlanPricePence(dims, baseline) },
      billingCycle,
      successUrl,
      cancelUrl:  `${APP_URL}/upgrade`,
      source:     'upgrade',
    })

    return NextResponse.json({ data: { url } })
  } catch (err) {
    if (err instanceof PlanCheckoutError) {
      return NextResponse.json({ error: { message: err.message } }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Stripe error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
