import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/backend/config/supabase'
import { getEffectiveUserId } from '@/lib/auth/get-effective-user'
import { customPlanDimensionsSchema, computeCustomPlanPricePence, getCustomPlanBaseline } from '@/backend/services/custom-plan-pricing'

/**
 * PATCH /api/account/custom-plan
 *
 * Lets a Custom Plan customer freely adjust their branches/staff/inventory/
 * repair limits during the 30-day trial, before any Stripe subscription
 * exists — this is a plain DB update, no Stripe involved. Once the customer
 * has actually paid (stripe_sub_id is set via /api/stripe/upgrade-custom),
 * this route rejects further edits — the paid configuration is what got
 * billed and editing it afterward is out of scope for this pass.
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getEffectiveUserId()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
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
        { error: parsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      )
    }
    const dims = parsed.data

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('business_id')
      .eq('id', userId)
      .single()

    if (!profile?.business_id) {
      return NextResponse.json({ error: 'No business found' }, { status: 400 })
    }

    const { data: sub } = await (supabase as any)
      .from('subscriptions')
      .select('id, is_custom, status, stripe_sub_id')
      .eq('business_id', profile.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!sub || !sub.is_custom) {
      return NextResponse.json({ error: 'No custom plan subscription found' }, { status: 400 })
    }
    if (sub.status !== 'trialing' || sub.stripe_sub_id) {
      return NextResponse.json(
        { error: 'Custom plan can only be edited during the trial, before payment.' },
        { status: 400 }
      )
    }

    // Never trust a client-sent total — always recompute server-side.
    const pricePence = computeCustomPlanPricePence(dims, baseline)

    const { error: updateErr } = await (supabase as any)
      .from('subscriptions')
      .update({
        custom_max_branches:  dims.branches,
        custom_max_users:     dims.staff,
        custom_max_products:  dims.inventoryLimit,
        custom_max_services:  dims.repairLimit,
        custom_price_monthly: pricePence / 100,
      })
      .eq('id', sub.id)

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to update custom plan' }, { status: 500 })
    }

    return NextResponse.json({ data: { priceMonthly: pricePence / 100 } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
