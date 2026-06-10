import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function fmtMoney(n: number): number {
  return Math.round(n * 100) / 100
}

async function handler(_request: NextRequest, _ctx: RequestContext) {
  const supabase = createAdminClient()

  const { data: businesses, error: bizErr } = await (supabase as any)
    .from('businesses')
    .select('id, name, subdomain, email, is_active, is_suspended, country, currency, created_at')
    .order('created_at', { ascending: false })

  if (bizErr) {
    return NextResponse.json({ error: bizErr.message }, { status: 500 })
  }

  const allBizs: any[] = businesses ?? []
  const ids = allBizs.map((b) => b.id)

  // Fetch related data in parallel
  const [
    { data: subs },
    { data: owners },
    { data: branches },
  ] = await Promise.all([
    ids.length > 0
      ? (supabase as any)
          .from('subscriptions')
          .select('business_id, status, billing_cycle, current_period_end, trial_ends_at, plans(name, price_monthly, price_yearly)')
          .in('business_id', ids)
      : Promise.resolve({ data: [] }),
    ids.length > 0
      ? (supabase as any)
          .from('profiles')
          .select('business_id, full_name, email')
          .in('business_id', ids)
          .eq('role', 'business_owner')
      : Promise.resolve({ data: [] }),
    ids.length > 0
      ? (supabase as any)
          .from('branches')
          .select('id, business_id')
          .in('business_id', ids)
      : Promise.resolve({ data: [] }),
  ])

  const subMap: Record<string, any>   = {}
  for (const s of subs    ?? []) subMap[s.business_id]   = s
  const ownerMap: Record<string, any> = {}
  for (const o of owners  ?? []) if (!ownerMap[o.business_id]) ownerMap[o.business_id] = o

  const branchToBiz: Record<string, string> = {}
  const allBranchIds: string[] = []
  for (const b of branches ?? []) {
    branchToBiz[b.id] = b.business_id
    allBranchIds.push(b.id)
  }

  const statsMap: Record<string, { sales: number; repairRev: number; repairs: number; customers: number; inventory: number }> = {}
  const init = () => ({ sales: 0, repairRev: 0, repairs: 0, customers: 0, inventory: 0 })

  if (allBranchIds.length > 0) {
    const [{ data: salesData }, { data: repairsData }, { data: productsData }, { data: customersData }] =
      await Promise.all([
        (supabase as any).from('sales').select('branch_id, total').in('branch_id', allBranchIds),
        (supabase as any).from('repairs').select('branch_id, actual_cost').in('branch_id', allBranchIds),
        (supabase as any).from('branch_products').select('branch_id').in('branch_id', allBranchIds).eq('is_enabled', true),
        (supabase as any).from('customers').select('branch_id').in('branch_id', allBranchIds),
      ])

    for (const s of salesData    ?? []) { const b = branchToBiz[s.branch_id]; if (!b) continue; if (!statsMap[b]) statsMap[b] = init(); statsMap[b].sales     += s.total       ?? 0 }
    for (const r of repairsData  ?? []) { const b = branchToBiz[r.branch_id]; if (!b) continue; if (!statsMap[b]) statsMap[b] = init(); statsMap[b].repairs++;  statsMap[b].repairRev += r.actual_cost ?? 0 }
    for (const p of productsData ?? []) { const b = branchToBiz[p.branch_id]; if (!b) continue; if (!statsMap[b]) statsMap[b] = init(); statsMap[b].inventory++ }
    for (const c of customersData ?? []) { const b = branchToBiz[c.branch_id]; if (!b) continue; if (!statsMap[b]) statsMap[b] = init(); statsMap[b].customers++ }
  }

  // ── Build worksheet rows ───────────────────────────────────────────────────

  const headers = [
    'Business Name', 'Subdomain', 'Owner Name', 'Owner Email', 'Contact Email',
    'Plan', 'Subscription Status', 'Billing Cycle', 'Period End',
    'Platform Status', 'Country', 'Currency',
    'Sales Revenue (£)', 'Repair Revenue (£)', 'Customers', 'Repairs', 'Inventory Items',
    'Joined',
  ]

  const dataRows = allBizs.map((biz) => {
    const sub   = subMap[biz.id]
    const owner = ownerMap[biz.id]
    const stats = statsMap[biz.id] ?? init()
    const plan  = sub?.plans as any
    const periodEnd = sub?.current_period_end ?? sub?.trial_ends_at ?? null

    return [
      biz.name,
      `${biz.subdomain}.repairbooking.co.uk`,
      owner?.full_name  ?? '',
      owner?.email      ?? '',
      biz.email         ?? '',
      plan?.name        ?? '',
      sub?.status       ?? '',
      sub?.billing_cycle ?? '',
      fmtDate(periodEnd),
      biz.is_active ? 'Active' : biz.is_suspended ? 'Suspended' : 'Inactive',
      biz.country  ?? '',
      biz.currency ?? '',
      fmtMoney(stats.sales),
      fmtMoney(stats.repairRev),
      stats.customers,
      stats.repairs,
      stats.inventory,
      fmtDate(biz.created_at),
    ]
  })

  // ── Create workbook ────────────────────────────────────────────────────────

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])

  // Column widths (approximate, in character units)
  ws['!cols'] = [
    { wch: 30 }, // Business Name
    { wch: 35 }, // Subdomain
    { wch: 22 }, // Owner Name
    { wch: 28 }, // Owner Email
    { wch: 28 }, // Contact Email
    { wch: 16 }, // Plan
    { wch: 18 }, // Sub Status
    { wch: 14 }, // Billing Cycle
    { wch: 14 }, // Period End
    { wch: 14 }, // Platform Status
    { wch: 10 }, // Country
    { wch: 10 }, // Currency
    { wch: 18 }, // Sales Revenue
    { wch: 18 }, // Repair Revenue
    { wch: 12 }, // Customers
    { wch: 10 }, // Repairs
    { wch: 15 }, // Inventory
    { wch: 14 }, // Joined
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Businesses')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `businesses-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export const GET = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
