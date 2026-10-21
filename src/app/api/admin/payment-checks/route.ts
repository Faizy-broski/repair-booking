import { NextRequest, NextResponse } from 'next/server'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'
import { CUSTOM_PLAN_YEARLY_DISCOUNT } from '@/backend/services/custom-plan-pricing'
import { GRACE_MS } from '@/lib/subscription-access'

/**
 * Superadmin "Has this business paid?" checks for MANUAL subscriptions.
 *
 * GET  → pending checks, derived live (no cron): manual paid subscriptions whose
 *        current_period_end is within the next 24h or already passed, minus any
 *        already answered for that cycle. Grouped as due / grace / overdue.
 * POST { businessId, cycleKey, decision: 'paid' | 'unpaid' } → records the answer.
 *        Access isn't changed here — 'paid' is followed by recording the payment
 *        (extends the period); 'unpaid' lets the 24h grace run out as normal.
 */

export type PaymentCheckGroup = 'due' | 'grace' | 'overdue'

export interface PaymentCheckItem {
  businessId: string
  businessName: string
  subdomain: string
  cycleKey: string
  periodEnd: string
  graceEndsAt: string
  group: PaymentCheckGroup
  planName: string | null
  amountDue: number | null
  billingCycle: 'monthly' | 'yearly'
  /** Shape RecordManualPaymentModal expects */
  business: {
    id: string
    name: string
    subscriptions: Array<{
      status: string
      billing_cycle: string | null
      current_period_end: string | null
      trial_ends_at: string | null
      plan_id: string | null
      is_custom: boolean | null
      custom_price_monthly: number | null
    }>
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

async function getHandler(_req: NextRequest, _ctx: RequestContext) {
  const supabase = createAdminClient() as any
  const now = Date.now()

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('business_id, status, billing_cycle, current_period_end, trial_ends_at, plan_id, is_custom, custom_price_monthly, stripe_sub_id, plans(name, price_monthly, price_yearly), businesses(name, subdomain, is_suspended)')
    .eq('status', 'active')
    .is('stripe_sub_id', null)
    .is('trial_ends_at', null)
    .not('current_period_end', 'is', null)
    .lte('current_period_end', new Date(now + DAY_MS).toISOString())
    .order('current_period_end', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Already-answered cycles (table missing before migration 212 → treat as none answered)
  const { data: decided } = await supabase.from('subscription_payment_checks').select('business_id, cycle_key')
  const answered = new Set(((decided ?? []) as { business_id: string; cycle_key: string }[]).map((d) => `${d.business_id}|${d.cycle_key}`))

  const items: PaymentCheckItem[] = []
  for (const s of (subs ?? []) as any[]) {
    if (!s.businesses || s.businesses.is_suspended) continue
    const endMs = new Date(s.current_period_end).getTime()
    const cycleKey = new Date(endMs).toISOString()
    if (answered.has(`${s.business_id}|${cycleKey}`)) continue

    const cycle: 'monthly' | 'yearly' = s.billing_cycle === 'yearly' ? 'yearly' : 'monthly'
    let amountDue: number | null = null
    if (s.is_custom && s.custom_price_monthly != null) {
      const m = Number(s.custom_price_monthly)
      amountDue = cycle === 'yearly' ? Math.round(m * 12 * (1 - CUSTOM_PLAN_YEARLY_DISCOUNT) * 100) / 100 : m
    } else if (s.plans) {
      amountDue = cycle === 'yearly' ? Number(s.plans.price_yearly ?? s.plans.price_monthly * 12) : Number(s.plans.price_monthly)
    }

    const group: PaymentCheckGroup = endMs > now ? 'due' : now - endMs < GRACE_MS ? 'grace' : 'overdue'
    items.push({
      businessId: s.business_id,
      businessName: s.businesses.name,
      subdomain: s.businesses.subdomain,
      cycleKey,
      periodEnd: s.current_period_end,
      graceEndsAt: new Date(endMs + GRACE_MS).toISOString(),
      group,
      planName: s.is_custom ? 'Custom Plan' : (s.plans?.name ?? null),
      amountDue,
      billingCycle: cycle,
      business: {
        id: s.business_id,
        name: s.businesses.name,
        subscriptions: [{
          status: s.status,
          billing_cycle: s.billing_cycle,
          current_period_end: s.current_period_end,
          trial_ends_at: s.trial_ends_at,
          plan_id: s.plan_id,
          is_custom: s.is_custom,
          custom_price_monthly: s.custom_price_monthly,
        }],
      },
    })
  }

  const order: Record<PaymentCheckGroup, number> = { grace: 0, due: 1, overdue: 2 }
  items.sort((a, b) => order[a.group] - order[b.group] || a.periodEnd.localeCompare(b.periodEnd))
  return NextResponse.json({ data: items })
}

async function postHandler(req: NextRequest, ctx: RequestContext) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }
  const { businessId, cycleKey, decision } = body ?? {}
  if (!businessId || typeof businessId !== 'string') return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
  if (!cycleKey || isNaN(Date.parse(cycleKey))) return NextResponse.json({ error: 'cycleKey must be a valid date' }, { status: 400 })
  if (decision !== 'paid' && decision !== 'unpaid') return NextResponse.json({ error: "decision must be 'paid' or 'unpaid'" }, { status: 400 })

  const supabase = createAdminClient() as any
  const key = new Date(cycleKey).toISOString()

  // For 'unpaid', the answer must be about the subscription's CURRENT cycle —
  // a stale click (period already extended) must not record against the wrong
  // cycle. 'paid' is posted after recording the payment, when the period has
  // already moved on, so it's accepted as an audit entry for the old cycle.
  if (decision === 'unpaid') {
    const { data: sub } = await supabase.from('subscriptions').select('current_period_end').eq('business_id', businessId).maybeSingle()
    const current = sub?.current_period_end ? new Date(sub.current_period_end).toISOString() : null
    if (current !== key) {
      return NextResponse.json({ error: 'This subscription has changed since the check was shown — refresh and try again.' }, { status: 409 })
    }
  }

  const { error } = await supabase
    .from('subscription_payment_checks')
    .upsert(
      { business_id: businessId, cycle_key: key, decision, decided_by: ctx.auth.userId, decided_at: new Date().toISOString() },
      { onConflict: 'business_id,cycle_key' }
    )
  if (error) return NextResponse.json({ error: `Could not save (is migration 212 applied?): ${error.message}` }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET  = withMiddleware(getHandler,  { requiredRole: 'super_admin', skipTenant: true })
export const POST = withMiddleware(postHandler, { requiredRole: 'super_admin', skipTenant: true })
