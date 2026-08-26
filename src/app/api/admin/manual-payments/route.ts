import { NextRequest, NextResponse } from 'next/server'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'

// Platform-wide view of manual (bank transfer / cash / cheque) payments across
// every business — the manual-payment counterpart to GET /api/admin/subscriptions,
// which only ever reflects live Stripe billing.

export interface ManualPaymentListRow {
  id: string
  business_id: string
  business_name: string
  subdomain: string
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
  created_by_name: string | null
}

interface ManualPaymentStats {
  totalAmount: number
  thisMonthAmount: number
  paymentsCount: number
  businessesCount: number
}

function normaliseRow(row: any): ManualPaymentListRow {
  const biz     = Array.isArray(row.businesses) ? row.businesses[0] : row.businesses
  const creator = Array.isArray(row.profiles)   ? row.profiles[0]   : row.profiles
  const plan    = Array.isArray(row.plans)      ? row.plans[0]      : row.plans
  return {
    id:               row.id,
    business_id:      row.business_id,
    business_name:    biz?.name ?? '',
    subdomain:        biz?.subdomain ?? '',
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
    created_by_name:  creator?.full_name ?? null,
  }
}

function computeStats(rows: Array<{ amount: number; business_id: string; paid_at: string }>): ManualPaymentStats {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  let totalAmount = 0
  let thisMonthAmount = 0
  const businesses = new Set<string>()

  for (const row of rows) {
    totalAmount += row.amount
    businesses.add(row.business_id)
    if (new Date(row.paid_at) >= monthStart) thisMonthAmount += row.amount
  }

  return {
    totalAmount: Math.round(totalAmount * 100) / 100,
    thisMonthAmount: Math.round(thisMonthAmount * 100) / 100,
    paymentsCount: rows.length,
    businessesCount: businesses.size,
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

  const search = searchParams.get('search')?.trim() || null

  const supabase = createAdminClient()

  // ── Stats — computed across every manual payment, unfiltered by search ─────
  const { data: statsRows } = await (supabase as any)
    .from('manual_payments')
    .select('amount, business_id, paid_at')

  const stats = computeStats((statsRows ?? []) as any[])

  // ── Resolve business ids when searching by name ─────────────────────────────
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
      return NextResponse.json({ data: [], meta: { page, limit, total: 0 }, stats })
    }
  }

  let q = (supabase as any)
    .from('manual_payments')
    .select('*, businesses(id, name, subdomain), profiles(full_name), plans(name)', { count: 'exact' })
    .order('paid_at', { ascending: false })
    .range(from, to)

  if (hasSearchFilter) q = q.in('business_id', businessIdFilter)

  const { data: rows, error, count } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data: (rows ?? []).map(normaliseRow),
    meta: { page, limit, total: count ?? 0 },
    stats,
  })
}

export const GET = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
