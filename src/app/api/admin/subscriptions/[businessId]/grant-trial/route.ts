import { NextRequest, NextResponse } from 'next/server'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'
import { invalidateBusinessCache } from '@/backend/services/module-config.service'

const MAX_TRIAL_DAYS = 365

/**
 * POST /api/admin/subscriptions/[businessId]/grant-trial
 * Body: { planId: string, days?: number, trialEndsAt?: string (ISO / yyyy-mm-dd) }
 *
 * Self-serve signups no longer get a free trial — this is the only way a
 * business gets one. Works on any business (new, unpaid 'incomplete',
 * expired, canceled, or with no subscription at all). Refuses when a live
 * paid Stripe subscription exists, since Stripe webhooks would immediately
 * fight the trial state — cancel that first.
 */
async function handler(
  request: NextRequest,
  _ctx: RequestContext,
  routeCtx: { params: Promise<{ businessId: string }> }
) {
  const { businessId } = await routeCtx.params
  const supabase = createAdminClient() as any

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { planId, days, trialEndsAt } = body ?? {}
  if (!planId || typeof planId !== 'string') {
    return NextResponse.json({ error: 'planId is required' }, { status: 400 })
  }

  // ── Resolve trial end date ────────────────────────────────────────────────
  let endsAt: Date
  if (trialEndsAt) {
    endsAt = new Date(trialEndsAt)
    if (Number.isNaN(endsAt.getTime())) {
      return NextResponse.json({ error: 'trialEndsAt is not a valid date' }, { status: 400 })
    }
    // A bare yyyy-mm-dd means "through the end of that day"
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(trialEndsAt))) endsAt.setUTCHours(23, 59, 59, 999)
  } else {
    const n = Number(days)
    if (!Number.isInteger(n) || n < 1 || n > MAX_TRIAL_DAYS) {
      return NextResponse.json({ error: `days must be a whole number between 1 and ${MAX_TRIAL_DAYS}` }, { status: 400 })
    }
    endsAt = new Date(Date.now() + n * 24 * 60 * 60 * 1000)
  }
  if (endsAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Trial end date must be in the future' }, { status: 400 })
  }
  if (endsAt.getTime() > Date.now() + MAX_TRIAL_DAYS * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: `Trial cannot be longer than ${MAX_TRIAL_DAYS} days` }, { status: 400 })
  }

  // ── Load business, plan, existing subscription ───────────────────────────
  const [{ data: business }, { data: plan }, { data: existingSub }] = await Promise.all([
    supabase.from('businesses').select('id, is_suspended').eq('id', businessId).maybeSingle(),
    supabase.from('plans').select('id, name, plan_type').eq('id', planId).maybeSingle(),
    supabase
      .from('subscriptions')
      .select('status, stripe_sub_id, stripe_customer_id, billing_cycle, livemode, is_custom, custom_max_branches')
      .eq('business_id', businessId)
      .maybeSingle(),
  ])

  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  if (!plan)     return NextResponse.json({ error: 'Plan not found' }, { status: 400 })

  if (existingSub?.stripe_sub_id && ['active', 'past_due'].includes(existingSub.status)) {
    return NextResponse.json(
      { error: 'This business has a live paid Stripe subscription. Cancel it before granting a trial.' },
      { status: 409 }
    )
  }

  const isCustomPlan = plan.plan_type === 'custom'
  if (isCustomPlan && !existingSub?.is_custom) {
    return NextResponse.json(
      { error: 'Custom Plan trials need custom limits — set them with Edit Subscription, or pick a standard plan.' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const endsAtIso = endsAt.toISOString()

  // ── Upsert subscription as trialing ───────────────────────────────────────
  const { error: subErr } = await supabase
    .from('subscriptions')
    .upsert(
      {
        business_id:          businessId,
        plan_id:              planId,
        status:               'trialing',
        billing_cycle:        existingSub?.billing_cycle ?? 'monthly',
        trial_ends_at:        endsAtIso,
        current_period_start: now,
        current_period_end:   endsAtIso,
        canceled_at:          null,
        // Any previous Stripe subscription is dead (guarded above) — detach it so a
        // late webhook for it can't flip this trial. Keep the customer for later checkout.
        stripe_sub_id:        null,
        stripe_customer_id:   existingSub?.stripe_customer_id ?? null,
        livemode:             existingSub?.livemode ?? false,
        // Switching to a standard plan clears any stale custom overrides
        ...(isCustomPlan
          ? {}
          : {
              is_custom:            false,
              custom_max_branches:  null,
              custom_max_users:     null,
              custom_max_products:  null,
              custom_max_services:  null,
              custom_price_monthly: null,
              custom_price_locked:  false,
            }),
      },
      { onConflict: 'business_id' }
    )

  if (subErr) {
    console.error('[admin/grant-trial] upsert error:', subErr.message)
    return NextResponse.json({ error: subErr.message }, { status: 500 })
  }

  // ── Sync business (both trial_ends_at copies stay in step) ───────────────
  // Don't override a superadmin suspension — that's a separate, explicit lock.
  const { error: bizErr } = await supabase
    .from('businesses')
    .update({
      trial_ends_at: endsAtIso,
      stripe_subscription_id: null,
      ...(business.is_suspended ? {} : { is_active: true }),
    })
    .eq('id', businessId)

  if (bizErr) console.error('[admin/grant-trial] business update error:', bizErr.message)

  await invalidateBusinessCache(businessId)

  return NextResponse.json({
    ok: true,
    trialEndsAt: endsAtIso,
    planName: plan.name,
    stillSuspended: !!business.is_suspended,
  })
}

export const POST = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
