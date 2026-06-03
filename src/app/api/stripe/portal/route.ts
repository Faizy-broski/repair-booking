import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminSupabase } from '@/backend/config/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

export async function POST(request: NextRequest) {
  // Authenticate the request
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminSupa = getAdminSupabase() as any

  // Resolve the business for this user
  const { data: profile } = await adminSupa
    .from('profiles')
    .select('business_id')
    .eq('id', user.id)
    .single()

  if (!profile?.business_id) {
    return NextResponse.json({ error: 'No business found' }, { status: 404 })
  }

  // Get stripe_customer_id — check businesses first, fall back to subscriptions
  const { data: business } = await adminSupa
    .from('businesses')
    .select('stripe_customer_id')
    .eq('id', profile.business_id)
    .single()

  let stripeCustomerId: string | null = business?.stripe_customer_id ?? null

  if (!stripeCustomerId) {
    const { data: sub } = await adminSupa
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('business_id', profile.business_id)
      .maybeSingle()
    stripeCustomerId = sub?.stripe_customer_id ?? null
  }

  if (!stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account found. Please contact support.' }, { status: 404 })
  }

  // Validate the stored customer ID — a test-mode ID will fail with live keys.
  // If stale, clear it and tell the user to resubscribe so a live customer gets created.
  try {
    const existing = await stripe.customers.retrieve(stripeCustomerId)
    if ((existing as any).deleted) {
      throw new Error('Customer deleted')
    }
  } catch {
    await adminSupa
      .from('businesses')
      .update({ stripe_customer_id: null })
      .eq('id', profile.business_id)
    await adminSupa
      .from('subscriptions')
      .update({ stripe_customer_id: null })
      .eq('business_id', profile.business_id)
    return NextResponse.json(
      { error: 'Your billing account could not be found in the current payment environment. Please resubscribe to restore access.' },
      { status: 404 }
    )
  }

  // Build return URL from the incoming request host so it works on any subdomain
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const host = request.headers.get('host') ?? ''
  const returnUrl = `${protocol}://${host}/account`

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: returnUrl,
    })
    return NextResponse.json({ data: { url: portalSession.url } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create billing portal session'
    console.error('[stripe/portal]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
