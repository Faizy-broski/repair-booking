import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-02-25.clover' as any,
})

/**
 * Read-only diagnostic: lists EVERY Stripe subscription (any status) for a
 * business's Stripe customer, so we can spot duplicate/parallel subscriptions
 * left behind by plan-change flows that create a new subscription instead of
 * modifying the existing one. Does not create, modify, or cancel anything.
 */
async function handler(
  _request: NextRequest,
  _ctx: RequestContext,
  routeCtx: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await routeCtx.params

  const supabase = createAdminClient()

  const { data: business, error: bizErr } = await (supabase as any)
    .from('businesses')
    .select('stripe_customer_id')
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
    const list = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 20,
    })

    // Stripe only allows expanding 4 levels deep, and items[].price.product
    // would be a 5th — so fetch product names separately (best-effort; a
    // failure here shouldn't break the whole diagnostic panel).
    const productIds = [...new Set(
      list.data.flatMap((sub) => sub.items.data.map((item) => item.price.product))
        .filter((p): p is string => typeof p === 'string')
    )]
    const productNames = new Map<string, string>()
    try {
      const products = await Promise.all(productIds.map((id) => stripe.products.retrieve(id)))
      products.forEach((p) => productNames.set(p.id, p.name))
    } catch {
      // Non-fatal — panel still works without product names.
    }

    const formatted = list.data.map((sub) => {
      // Stripe's newer flexible-billing API versions moved current_period_start/end
      // off the subscription object down to each subscription item — fall back to
      // the first item's period when the subscription-level fields aren't present.
      const firstItem = sub.items.data[0] as any
      const periodStart = (sub as any).current_period_start ?? firstItem?.current_period_start ?? null
      const periodEnd   = (sub as any).current_period_end   ?? firstItem?.current_period_end   ?? null

      return {
        id:                    sub.id,
        status:                sub.status,
        created:               sub.created,
        current_period_start: periodStart,
        current_period_end:   periodEnd,
        cancel_at_period_end:  sub.cancel_at_period_end,
        canceled_at:           sub.canceled_at,
        items: sub.items.data.map((item) => ({
          price_id:      item.price.id,
          product_name:  typeof item.price.product === 'string' ? productNames.get(item.price.product) ?? null : null,
          unit_amount:   item.price.unit_amount,
          currency:      item.price.currency,
          interval:      item.price.recurring?.interval ?? null,
          quantity:      item.quantity,
        })),
      }
    })

    return NextResponse.json({ data: formatted, stripeCustomerId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    console.error('[admin/subscriptions/stripe-subscriptions]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const GET = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
