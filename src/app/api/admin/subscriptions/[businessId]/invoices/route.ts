import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-02-25.clover' as any,
})

async function handler(
  _request: NextRequest,
  _ctx: RequestContext,
  routeCtx: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await routeCtx.params

  const supabase = createAdminClient()

  const { data: business, error: bizErr } = await (supabase as any)
    .from('businesses')
    .select('stripe_customer_id, name')
    .eq('id', businessId)
    .single()

  if (bizErr || !business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  let stripeCustomerId: string | null = business.stripe_customer_id ?? null

  if (!stripeCustomerId) {
    const { data: sub } = await (supabase as any)
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    stripeCustomerId = sub?.stripe_customer_id ?? null
  }

  if (!stripeCustomerId) {
    return NextResponse.json({ data: [] })
  }

  try {
    const [paid, open] = await Promise.all([
      stripe.invoices.list({ customer: stripeCustomerId, limit: 24, status: 'paid' }),
      stripe.invoices.list({ customer: stripeCustomerId, limit: 5,  status: 'open' }),
    ])

    const all = [...paid.data, ...open.data].sort((a, b) => b.created - a.created)

    const formatted = all.map((inv) => ({
      id:                 inv.id,
      date:               inv.created,
      amount:             inv.amount_paid || inv.amount_due,
      currency:           inv.currency,
      status:             inv.status,
      period_start:       inv.period_start,
      period_end:         inv.period_end,
      invoice_pdf:        inv.invoice_pdf,
      hosted_invoice_url: inv.hosted_invoice_url,
      description:        inv.lines?.data?.[0]?.description ?? null,
    }))

    return NextResponse.json({ data: formatted })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    console.error('[admin/subscriptions/invoices]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const GET = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
