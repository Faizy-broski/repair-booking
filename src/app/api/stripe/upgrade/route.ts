import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/backend/config/supabase'
import { createPlanCheckoutSession, PlanCheckoutError } from '@/backend/services/plan-checkout.service'

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

    const { data: bizRow } = await (supabase as any)
      .from('businesses')
      .select('subdomain')
      .eq('id', businessId)
      .single()
    const subdomain = (bizRow as { subdomain?: string } | null)?.subdomain ?? ''

    const appUrlObj = new URL(APP_URL)
    // {CHECKOUT_SESSION_ID} is a Stripe template variable — it gets replaced with
    // the real session ID at redirect time, so we can verify the payment server-side
    // without relying on the webhook.
    const successUrl = subdomain
      ? `${appUrlObj.protocol}//${subdomain}.${appUrlObj.host}/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}`
      : `${APP_URL}/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}`

    const { url } = await createPlanCheckoutSession({
      businessId,
      email:      user.email ?? '',
      target:     { kind: 'plan', planId },
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
