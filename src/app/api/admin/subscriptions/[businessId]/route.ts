import { NextRequest, NextResponse } from 'next/server'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'
import { invalidateBusinessCache } from '@/backend/services/module-config.service'
import {
  getCustomPlanBaseline,
  customPlanDimensionsSchema,
  computeCustomPlanPricePence,
} from '@/backend/services/custom-plan-pricing'

const VALID_STATUSES  = ['active', 'trialing', 'past_due', 'canceled', 'suspended'] as const
const VALID_CYCLES    = ['monthly', 'yearly'] as const

type Status  = typeof VALID_STATUSES[number]
type Cycle   = typeof VALID_CYCLES[number]

// Whether a business should be marked is_active for a given subscription status
function resolveIsActive(status: Status) {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

async function handler(
  request: NextRequest,
  _ctx: RequestContext,
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

  const { planId, status, billingCycle, currentPeriodEnd, trialEndsAt, customDimensions } = body ?? {}

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!planId || typeof planId !== 'string') {
    return NextResponse.json({ error: 'planId is required' }, { status: 400 })
  }
  if (!status || !VALID_STATUSES.includes(status as Status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }
  if (!billingCycle || !VALID_CYCLES.includes(billingCycle as Cycle)) {
    return NextResponse.json(
      { error: `billingCycle must be one of: ${VALID_CYCLES.join(', ')}` },
      { status: 400 }
    )
  }
  if (currentPeriodEnd && isNaN(Date.parse(currentPeriodEnd))) {
    return NextResponse.json({ error: 'currentPeriodEnd must be a valid ISO date' }, { status: 400 })
  }
  if (trialEndsAt && isNaN(Date.parse(trialEndsAt))) {
    return NextResponse.json({ error: 'trialEndsAt must be a valid ISO date' }, { status: 400 })
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

  // ── Verify plan exists ─────────────────────────────────────────────────────
  const { data: plan, error: planErr } = await (supabase as any)
    .from('plans')
    .select('id, name, plan_type')
    .eq('id', planId)
    .single()

  if (planErr || !plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  }

  // ── Custom Plan dimensions ──────────────────────────────────────────────────
  // The "Custom Plan" catalog row is a shared placeholder (see migration 111) —
  // the real branches/staff/inventory/repair numbers and price live on the
  // subscription row itself, never trusted from the client without recomputing.
  const isCustomPlan = plan.plan_type === 'custom'
  let customFields: Record<string, unknown> = {
    is_custom:            false,
    custom_max_branches:  null,
    custom_max_users:     null,
    custom_max_products:  null,
    custom_max_services:  null,
    custom_price_monthly: null,
  }

  if (isCustomPlan) {
    if (!customDimensions || typeof customDimensions !== 'object') {
      return NextResponse.json({ error: 'customDimensions is required for the Custom Plan' }, { status: 400 })
    }
    const baseline = await getCustomPlanBaseline(supabase)
    const parsed = customPlanDimensionsSchema(baseline).safeParse(customDimensions)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid custom plan dimensions' },
        { status: 400 }
      )
    }
    const dims = parsed.data
    const pricePence = computeCustomPlanPricePence(dims, baseline)
    customFields = {
      is_custom:            true,
      custom_max_branches:  dims.branches,
      custom_max_users:     dims.staff,
      custom_max_products:  dims.inventoryLimit,
      custom_max_services:  dims.repairLimit,
      custom_price_monthly: pricePence / 100,
    }
  }

  // ── Read existing subscription to preserve Stripe IDs ──────────────────────
  const { data: existingSub } = await (supabase as any)
    .from('subscriptions')
    .select('stripe_sub_id, stripe_customer_id, livemode, canceled_at')
    .eq('business_id', businessId)
    .maybeSingle()

  const now = new Date().toISOString()

  // Preserve canceled_at timestamp if already canceled; set it now on first cancellation
  const canceledAt = (status as Status) === 'canceled'
    ? (existingSub?.canceled_at ?? now)
    : null

  // ── Upsert subscription row ────────────────────────────────────────────────
  const { error: subErr } = await (supabase as any)
    .from('subscriptions')
    .upsert(
      {
        business_id:          businessId,
        plan_id:              planId,
        status,
        billing_cycle:        billingCycle,
        current_period_end:   currentPeriodEnd ? new Date(currentPeriodEnd).toISOString() : null,
        trial_ends_at:        trialEndsAt      ? new Date(trialEndsAt).toISOString()      : null,
        canceled_at:          canceledAt,
        stripe_sub_id:        existingSub?.stripe_sub_id        ?? null,
        stripe_customer_id:   existingSub?.stripe_customer_id   ?? null,
        livemode:             existingSub?.livemode              ?? false,
        ...customFields,
      },
      { onConflict: 'business_id' }
    )

  if (subErr) {
    console.error('[admin/subscriptions PATCH] upsert error:', subErr.message)
    return NextResponse.json({ error: subErr.message }, { status: 500 })
  }

  // ── Sync business active state ─────────────────────────────────────────────
  const { error: bizUpdateErr } = await (supabase as any)
    .from('businesses')
    .update({ is_active: resolveIsActive(status as Status) })
    .eq('id', businessId)

  if (bizUpdateErr) {
    console.error('[admin/subscriptions PATCH] business update error:', bizUpdateErr.message)
    // Non-fatal — subscription was saved, just log
  }

  // ── Invalidate module config cache ─────────────────────────────────────────
  // Required so module visibility changes take effect on the tenant immediately
  await invalidateBusinessCache(businessId)

  return NextResponse.json({
    ok: true,
    business: business.name,
    plan:     plan.name,
    status,
  })
}

export const PATCH = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
