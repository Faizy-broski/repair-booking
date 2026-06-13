import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { adminSupabase } from '@/backend/config/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' })

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  switch (event.type) {
    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      if (invoice.subscription) {
        // Mark subscription active and live (real payment confirms live mode)
        await adminSupabase
          .from('subscriptions')
          .update({ status: 'active', livemode: true })
          .eq('stripe_sub_id', invoice.subscription)

        // Resolve the business_id first, then activate the business
        const { data: subRow } = await adminSupabase
          .from('subscriptions')
          .select('business_id')
          .eq('stripe_sub_id', invoice.subscription as string)
          .maybeSingle()

        if (subRow?.business_id) {
          await adminSupabase
            .from('businesses')
            .update({ is_active: true })
            .eq('id', subRow.business_id)
        }
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await adminSupabase
        .from('subscriptions')
        .update({ status: 'canceled', canceled_at: new Date().toISOString() })
        .eq('stripe_sub_id', sub.id)
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      await adminSupabase
        .from('subscriptions')
        .update({
          status: sub.status as string,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        })
        .eq('stripe_sub_id', sub.id)
      break
    }
  }

  return NextResponse.json({ received: true })
}
