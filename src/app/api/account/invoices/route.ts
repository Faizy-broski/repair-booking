import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/backend/config/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

export async function GET() {
  try {
    const supabaseUser = await createClient()
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .single()

    if (!profile?.business_id) {
      return NextResponse.json({ data: [] })
    }

    // Resolve Stripe customer ID — check businesses first, then subscriptions table
    const { data: business } = await (supabase as any)
      .from('businesses')
      .select('stripe_customer_id')
      .eq('id', profile.business_id)
      .single()

    let stripeCustomerId: string | null = business?.stripe_customer_id ?? null

    if (!stripeCustomerId) {
      const { data: sub } = await (supabase as any)
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('business_id', profile.business_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      stripeCustomerId = sub?.stripe_customer_id ?? null
    }

    if (!stripeCustomerId) {
      return NextResponse.json({ data: [] })
    }

    // Fetch all invoices (paid + open so trialing users still see upcoming)
    const [paid, open] = await Promise.all([
      stripe.invoices.list({ customer: stripeCustomerId, limit: 24, status: 'paid' }),
      stripe.invoices.list({ customer: stripeCustomerId, limit: 5,  status: 'open' }),
    ])

    const all = [...paid.data, ...open.data].sort((a, b) => b.created - a.created)

    const formatted = all.map((inv) => ({
      id:                  inv.id,
      date:                inv.created,
      amount:              inv.amount_paid || inv.amount_due,
      currency:            inv.currency,
      status:              inv.status,
      period_start:        inv.period_start,
      period_end:          inv.period_end,
      invoice_pdf:         inv.invoice_pdf,
      hosted_invoice_url:  inv.hosted_invoice_url,
      description:         inv.lines?.data?.[0]?.description ?? null,
    }))

    return NextResponse.json({ data: formatted })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    console.error('[account/invoices]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
