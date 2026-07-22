import { NextRequest, NextResponse } from 'next/server'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'
import { effectiveMonthlyPrice, CUSTOM_PLAN_YEARLY_DISCOUNT } from '@/backend/services/custom-plan-pricing'

export interface SubscriptionRow {
  business_id: string
  business_name: string
  subdomain: string
  stripe_customer_id: string | null
  subscription_id: string | null
  status: string | null
  billing_cycle: string | null
  plan_id: string | null
  plan_name: string | null
  plan_price_monthly: number | null
  plan_price_yearly: number | null
  is_custom: boolean
  custom_max_branches: number | null
  custom_max_users: number | null
  custom_max_products: number | null
  custom_max_services: number | null
  custom_price_monthly: number | null
  current_period_end: string | null
  trial_ends_at: string | null
  canceled_at: string | null
  is_active: boolean
}

interface StatsRow {
  status: string
  billing_cycle: string | null
  is_custom: boolean | null
  custom_price_monthly: number | null
  plans: { price_monthly: number; price_yearly: number | null } | null
}

function computeStats(rows: StatsRow[]) {
  let mrr = 0
  const counts: Record<string, number> = {
    active: 0, trialing: 0, past_due: 0, canceled: 0, suspended: 0,
  }

  for (const row of rows) {
    const status = row.status
    if (status in counts) counts[status]++
    if (status === 'active' || status === 'trialing') {
      mrr += effectiveMonthlyPrice(row)
    }
  }

  return { mrr: Math.round(mrr), ...counts, total_subscriptions: rows.length }
}


function normaliseSubRow(sub: any): SubscriptionRow {
  const biz = Array.isArray(sub.businesses) ? sub.businesses[0] : sub.businesses
  const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans
  const effectiveMonthly = effectiveMonthlyPrice(sub)
  return {
    business_id:        biz?.id ?? sub.business_id,
    business_name:      biz?.name ?? '',
    subdomain:          biz?.subdomain ?? '',
    stripe_customer_id: biz?.stripe_customer_id ?? sub.stripe_customer_id ?? null,
    subscription_id:    sub.id,
    status:             sub.status ?? null,
    billing_cycle:      sub.billing_cycle ?? null,
    plan_id:            sub.plan_id ?? plan?.id ?? null,
    plan_name:          plan?.name ?? null,
    // For a custom subscription these reflect the real negotiated price, not
    // the shared "Custom Plan" placeholder row's catalog price.
    plan_price_monthly: sub.is_custom ? effectiveMonthly : (plan?.price_monthly ?? null),
    plan_price_yearly:  sub.is_custom ? Math.round(effectiveMonthly * 12 * (1 - CUSTOM_PLAN_YEARLY_DISCOUNT)) : (plan?.price_yearly ?? null),
    is_custom:            sub.is_custom ?? false,
    custom_max_branches:  sub.custom_max_branches ?? null,
    custom_max_users:     sub.custom_max_users ?? null,
    custom_max_products:  sub.custom_max_products ?? null,
    custom_max_services:  sub.custom_max_services ?? null,
    custom_price_monthly: sub.custom_price_monthly ?? null,
    current_period_end: sub.current_period_end ?? null,
    trial_ends_at:      sub.trial_ends_at ?? null,
    canceled_at:        sub.canceled_at ?? null,
    is_active:          biz?.is_active ?? false,
  }
}

async function handler(request: NextRequest, _ctx: RequestContext) {
  const { searchParams } = request.nextUrl
  const rawPage  = parseInt(searchParams.get('page')  ?? '1', 10)
  const rawLimit = parseInt(searchParams.get('limit') ?? '20', 10)
  const page  = Math.max(1, isNaN(rawPage)  ? 1  : rawPage)
  const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit))
  const from  = (page - 1) * limit
  const to    = from + limit - 1

  const search       = searchParams.get('search')?.trim() || null
  const statusFilter = searchParams.get('status')?.trim() || null

  const supabase = createAdminClient()

  // ── Stats query — live-mode only so test Stripe data is excluded ───────────
  const { data: statsRows } = await (supabase as any)
    .from('subscriptions')
    .select('status, billing_cycle, is_custom, custom_price_monthly, plans(price_monthly, price_yearly)')
    .eq('livemode', true)

  const stats = computeStats((statsRows ?? []) as StatsRow[])

  // ── List query ────────────────────────────────────────────────────────────
  let data: SubscriptionRow[] = []
  let total = 0

  // If searching by business name, resolve matching business IDs first.
  // Filtering on embedded resources nulls them out rather than filtering rows,
  // so we do a separate lookup and filter by business_id IN (...).
  let businessIdFilter: string[] = []
  let hasSearchFilter = false
  if (search) {
    const { data: matched } = await (supabase as any)
      .from('businesses')
      .select('id')
      .ilike('name', `%${search}%`)
    businessIdFilter = (matched ?? []).map((b: { id: string }) => b.id)
    hasSearchFilter = true
    if (businessIdFilter.length === 0) {
      // No businesses match — return empty immediately, no need to query subscriptions
      return NextResponse.json({ data: [], meta: { page, limit, total: 0 }, stats })
    }
  }

  // Always query from subscriptions — businesses with no subscription row
  // are irrelevant on a billing page and are intentionally excluded.
  // No FK hint so PostgREST auto-resolves the businesses relationship.
  let q = (supabase as any)
    .from('subscriptions')
    .select(`
      id,
      status,
      billing_cycle,
      trial_ends_at,
      current_period_end,
      canceled_at,
      stripe_customer_id,
      business_id,
      plan_id,
      is_custom,
      custom_max_branches,
      custom_max_users,
      custom_max_products,
      custom_max_services,
      custom_price_monthly,
      businesses (
        id, name, subdomain, stripe_customer_id, is_active
      ),
      plans (
        id, name, price_monthly, price_yearly
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  q = q.eq('livemode', true)
  if (statusFilter)     q = q.eq('status', statusFilter)
  if (hasSearchFilter)  q = q.in('business_id', businessIdFilter)

  const { data: rows, error, count } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  data  = (rows ?? []).map(normaliseSubRow)
  total = count ?? 0

  return NextResponse.json({
    data,
    meta:  { page, limit, total },
    stats,
  })
}

export const GET = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
