import { NextRequest, NextResponse } from 'next/server'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'
import { CUSTOM_PLAN_YEARLY_DISCOUNT } from '@/backend/services/custom-plan-pricing'
import {
  extendSubscriptionPeriod,
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatus,
} from '@/backend/services/subscription-admin.service'

export interface ManualPaymentRow {
  id: string
  business_id: string
  amount: number
  currency: string
  plan_id: string | null
  plan_name: string | null
  billing_cycle: string | null
  method: string
  reference: string | null
  paid_at: string
  period_start: string | null
  period_end: string | null
  notes: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
}

const VALID_METHODS = ['bank_transfer', 'cash', 'cheque', 'other'] as const
type Method = typeof VALID_METHODS[number]
const VALID_CYCLES = ['monthly', 'yearly'] as const
type Cycle = typeof VALID_CYCLES[number]

function normaliseRow(row: any): ManualPaymentRow {
  const creator = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
  const plan    = Array.isArray(row.plans)    ? row.plans[0]    : row.plans
  return {
    id:               row.id,
    business_id:      row.business_id,
    amount:           Number(row.amount),
    currency:         row.currency,
    plan_id:          row.plan_id ?? null,
    plan_name:        plan?.name ?? null,
    billing_cycle:    row.billing_cycle ?? null,
    method:           row.method,
    reference:        row.reference ?? null,
    paid_at:          row.paid_at,
    period_start:     row.period_start ?? null,
    period_end:       row.period_end ?? null,
    notes:            row.notes ?? null,
    created_by:       row.created_by ?? null,
    created_by_name:  creator?.full_name ?? null,
    created_at:       row.created_at,
  }
}

// ── GET — list manual payments for a business ────────────────────────────────

async function getHandler(
  _request: NextRequest,
  _ctx: RequestContext,
  routeCtx: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await routeCtx.params
  const supabase = createAdminClient()

  const { data, error } = await (supabase as any)
    .from('manual_payments')
    .select('*, profiles(full_name), plans(name)')
    .eq('business_id', businessId)
    .order('paid_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: (data ?? []).map(normaliseRow) })
}

// ── POST — record a manual payment, optionally extending the subscription ───

async function postHandler(
  request: NextRequest,
  ctx: RequestContext,
  routeCtx: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await routeCtx.params
  const supabase = createAdminClient()

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    planId, billingCycle, method, reference, paidAt, periodStart, periodEnd, notes,
    extendSubscription, newStatus, newPeriodEnd,
  } = body ?? {}

  // ── Validation ───────────────────────────────────────────────────────────
  if (!planId || typeof planId !== 'string') {
    return NextResponse.json({ error: 'planId is required' }, { status: 400 })
  }
  if (!billingCycle || !VALID_CYCLES.includes(billingCycle as Cycle)) {
    return NextResponse.json({ error: `billingCycle must be one of: ${VALID_CYCLES.join(', ')}` }, { status: 400 })
  }
  if (!method || !VALID_METHODS.includes(method as Method)) {
    return NextResponse.json({ error: `method must be one of: ${VALID_METHODS.join(', ')}` }, { status: 400 })
  }
  if (!paidAt || isNaN(Date.parse(paidAt))) {
    return NextResponse.json({ error: 'paidAt must be a valid date' }, { status: 400 })
  }
  if (periodStart && isNaN(Date.parse(periodStart))) {
    return NextResponse.json({ error: 'periodStart must be a valid date' }, { status: 400 })
  }
  if (periodEnd && isNaN(Date.parse(periodEnd))) {
    return NextResponse.json({ error: 'periodEnd must be a valid date' }, { status: 400 })
  }
  if (extendSubscription) {
    if (!newStatus || !SUBSCRIPTION_STATUSES.includes(newStatus as SubscriptionStatus)) {
      return NextResponse.json(
        { error: `newStatus must be one of: ${SUBSCRIPTION_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }
    if (!newPeriodEnd || isNaN(Date.parse(newPeriodEnd))) {
      return NextResponse.json({ error: 'newPeriodEnd must be a valid date' }, { status: 400 })
    }
  }

  // ── Verify business exists ─────────────────────────────────────────────────
  const { data: business, error: bizErr } = await (supabase as any)
    .from('businesses')
    .select('id, name')
    .eq('id', businessId)
    .single()

  if (bizErr || !business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // ── Verify plan exists ───────────────────────────────────────────────────
  const { data: plan, error: planErr } = await (supabase as any)
    .from('plans')
    .select('id, name, plan_type, price_monthly, price_yearly')
    .eq('id', planId)
    .single()

  if (planErr || !plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  // ── Derive the amount server-side from the plan — never trust a client-sent
  //    total (same principle custom-plan-pricing.ts uses everywhere else). ──
  let amount: number
  if (plan.plan_type === 'custom') {
    const { data: existingSub } = await (supabase as any)
      .from('subscriptions')
      .select('is_custom, custom_price_monthly')
      .eq('business_id', businessId)
      .maybeSingle()

    if (!existingSub?.is_custom || existingSub.custom_price_monthly == null) {
      return NextResponse.json(
        { error: 'This business has no negotiated Custom Plan price yet — set one via Edit Subscription first.' },
        { status: 400 }
      )
    }
    const monthly = Number(existingSub.custom_price_monthly)
    amount = billingCycle === 'yearly'
      ? Math.round(monthly * 12 * (1 - CUSTOM_PLAN_YEARLY_DISCOUNT) * 100) / 100
      : monthly
  } else {
    amount = billingCycle === 'yearly'
      ? Number(plan.price_yearly ?? plan.price_monthly * 12)
      : Number(plan.price_monthly)
  }

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'This plan has no price to derive a payment amount from' }, { status: 400 })
  }

  // ── Insert the ledger row ───────────────────────────────────────────────────
  const { data: inserted, error: insertErr } = await (supabase as any)
    .from('manual_payments')
    .insert({
      business_id:   businessId,
      amount,
      currency:      'gbp',
      plan_id:       planId,
      billing_cycle: billingCycle,
      method,
      reference:     reference || null,
      paid_at:       new Date(paidAt).toISOString(),
      period_start:  periodStart ? new Date(periodStart).toISOString() : null,
      period_end:    periodEnd   ? new Date(periodEnd).toISOString()   : null,
      notes:         notes || null,
      created_by:    ctx.auth.userId,
    })
    .select('*, profiles(full_name), plans(name)')
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // ── Optionally extend/activate the subscription under this plan ────────────
  let subscriptionExtended: boolean | null = null
  if (extendSubscription) {
    try {
      subscriptionExtended = await extendSubscriptionPeriod(supabase, businessId, {
        status: newStatus as SubscriptionStatus,
        currentPeriodEnd: new Date(newPeriodEnd).toISOString(),
        planId,
        billingCycle: billingCycle as Cycle,
      })
      if (!subscriptionExtended) {
        return NextResponse.json({
          data: normaliseRow(inserted),
          subscriptionExtended: false,
          subscriptionExtendError: 'No subscription found for this business — assign a plan via Edit Subscription first.',
        })
      }
    } catch (err: any) {
      return NextResponse.json({
        data: normaliseRow(inserted),
        subscriptionExtended: false,
        subscriptionExtendError: err?.message ?? 'Failed to extend subscription',
      })
    }
  }

  return NextResponse.json({
    data: normaliseRow(inserted),
    ...(subscriptionExtended !== null ? { subscriptionExtended } : {}),
  })
}

export const GET  = withMiddleware(getHandler,  { requiredRole: 'super_admin', skipTenant: true })
export const POST = withMiddleware(postHandler, { requiredRole: 'super_admin', skipTenant: true })
