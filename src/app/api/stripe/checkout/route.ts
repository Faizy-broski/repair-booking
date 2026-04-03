import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-03-31.basil' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://repairbooking.co.uk'

// Map plan slugs → Stripe Price IDs (set these in .env)
const PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? '',
  growth:  process.env.STRIPE_PRICE_GROWTH  ?? '',
}

const schema = z.object({
  planId:     z.enum(['starter', 'growth']),
  businessId: z.string().uuid(),
  email:      z.string().email(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: { message: 'Invalid request' } }, { status: 400 })
    }

    const { planId, businessId, email } = parsed.data
    const priceId = PRICE_IDS[planId]

    if (!priceId) {
      return NextResponse.json(
        { error: { message: `Stripe price not configured for plan: ${planId}. Add STRIPE_PRICE_${planId.toUpperCase()} to .env` } },
        { status: 500 }
      )
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { businessId, planId },
      },
      metadata: { businessId, planId },
      success_url: `${APP_URL}/register/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/register?cancelled=1`,
    })

    return NextResponse.json({ data: { url: session.url } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
