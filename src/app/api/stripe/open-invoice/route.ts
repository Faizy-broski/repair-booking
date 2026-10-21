import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getAdminSupabase } from '@/backend/config/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://repairbooking.co.uk'

/**
 * GET /api/stripe/open-invoice
 *
 * For a past_due card subscription: returns the hosted payment page of its
 * latest OPEN invoice. Paying that existing invoice keeps the subscription —
 * and so its billing anchor/renewal day — exactly as it was (never start a
 * second subscription to "renew"). Falls back to the Customer Portal.
 * Read-only towards our DB.
 */
export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 })

  const admin = getAdminSupabase() as any
  const { data: profile } = await admin.from('profiles').select('business_id, role').eq('id', user.id).single()
  if (!profile?.business_id) return NextResponse.json({ error: { message: 'No business found' } }, { status: 404 })

  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_sub_id, stripe_customer_id')
    .eq('business_id', profile.business_id)
    .maybeSingle()

  if (!sub?.stripe_sub_id) {
    return NextResponse.json({ error: { message: 'No card subscription to pay — choose a plan on the billing page.' } }, { status: 404 })
  }

  try {
    const invoices = await stripe.invoices.list({ subscription: sub.stripe_sub_id, status: 'open', limit: 1 })
    const url = invoices.data[0]?.hosted_invoice_url
    if (url) return NextResponse.json({ data: { url } })

    // No open invoice (already paid / not yet issued) — send them to the portal
    const customer = sub.stripe_customer_id
    if (customer) {
      const portal = await stripe.billingPortal.sessions.create({ customer, return_url: `${APP_URL}/account?tab=billing` })
      return NextResponse.json({ data: { url: portal.url } })
    }
    return NextResponse.json({ error: { message: 'No outstanding invoice found.' } }, { status: 404 })
  } catch (err) {
    console.error('[stripe/open-invoice]', err)
    return NextResponse.json({ error: { message: 'Could not open the payment page. Please try again.' } }, { status: 500 })
  }
}
