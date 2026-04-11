import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { z } from 'zod'
import { createAdminClient } from '@/backend/config/supabase'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2026-02-25.clover' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://repairbooking.co.uk'

const schema = z.object({
  // Registration data — account is NOT created yet
  businessName:   z.string().min(2),
  subdomain:      z.string().min(2).max(30).regex(/^[a-z0-9-]+$/),
  email:          z.string().email(),
  phone:          z.string().optional(),
  fullName:       z.string().min(2),
  password:       z.string().min(8),
  mainBranchName: z.string().min(2),
  planId:         z.string().uuid('planId must be a valid plan UUID'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: parsed.error.errors[0]?.message ?? 'Invalid request' } },
        { status: 400 }
      )
    }

    const { businessName, subdomain, email, phone, fullName, password, mainBranchName, planId } = parsed.data
    const supabase = createAdminClient()

    // 1. Check subdomain is still free
    const { data: existing } = await supabase
      .from('businesses')
      .select('id')
      .eq('subdomain', subdomain.toLowerCase())
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: { message: 'Subdomain is already taken' } },
        { status: 409 }
      )
    }

    // 2. Look up plan's Stripe price ID
    const { data: plan, error: planErr } = await supabase
      .from('plans')
      .select('id, name, stripe_price_id_monthly, price_monthly')
      .eq('id', planId)
      .eq('is_active', true)
      .single()

    if (planErr || !plan) {
      return NextResponse.json({ error: { message: 'Plan not found' } }, { status: 400 })
    }

    // Auto-create Stripe product + price if not yet configured
    let stripePriceId = plan.stripe_price_id_monthly as string | null
    if (!stripePriceId) {
      const priceMonthly = (plan as any).price_monthly ?? 0
      if (priceMonthly <= 0) {
        return NextResponse.json(
          { error: { message: `Plan "${plan.name}" has no price and no Stripe price ID configured.` } },
          { status: 500 }
        )
      }
      const product = await stripe.products.create({ name: plan.name })
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(priceMonthly * 100),
        currency: 'gbp',
        recurring: { interval: 'month' },
      })
      stripePriceId = price.id

      // Persist so we don't recreate next time
      await (supabase as any)
        .from('plans')
        .update({ stripe_price_id_monthly: stripePriceId })
        .eq('id', planId)
    }

    // 3. Upsert pending registration (handles retry after previous failure)
    const { data: pending, error: pendingErr } = await (supabase as any)
      .from('pending_registrations')
      .upsert(
        {
          business_name:    businessName,
          subdomain:        subdomain.toLowerCase(),
          email,
          phone:            phone ?? null,
          full_name:        fullName,
          password_temp:    password,
          main_branch_name: mainBranchName,
          plan_id:          planId,
          expires_at:       new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        },
        { onConflict: 'email' }
      )
      .select('id')
      .single()

    if (pendingErr || !pending) {
      return NextResponse.json({ error: { message: 'Failed to save registration data' } }, { status: 500 })
    }

    // 4. Create Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { pendingId: pending.id },
      },
      metadata: { pendingId: pending.id },
      success_url: `${APP_URL}/register/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/register?cancelled=1`,
    })

    // 5. Store Stripe session ID back on the pending record
    await (supabase as any)
      .from('pending_registrations')
      .update({ stripe_session_id: session.id })
      .eq('id', pending.id)

    return NextResponse.json({ data: { url: session.url } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
