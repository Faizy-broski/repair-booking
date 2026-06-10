import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { withMiddleware } from '@/backend/middleware'
import type { RequestContext } from '@/backend/middleware'
import { createAdminClient } from '@/backend/config/supabase'

const ROLE_LABELS: Record<string, string> = {
  super_admin:      'Super Admin',
  business_owner:   'Business Owner',
  branch_manager:   'Branch Manager',
  staff:            'Staff',
  cashier:          'Cashier',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

async function handler(_request: NextRequest, _ctx: RequestContext) {
  const supabase = createAdminClient()

  // Fetch all profiles with business and branch names
  const { data: profiles, error } = await (supabase as any)
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      role,
      phone,
      is_active,
      created_at,
      business_id,
      businesses ( id, name, subdomain ),
      branches   ( id, name )
    `)
    .neq('role', 'super_admin')      // exclude platform super admins
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Build worksheet rows ───────────────────────────────────────────────────

  const headers = [
    'Full Name', 'Email', 'Phone', 'Role',
    'Business Name', 'Subdomain', 'Branch',
    'Active', 'Joined',
  ]

  const dataRows = (profiles ?? []).map((p: any) => {
    const biz    = Array.isArray(p.businesses) ? p.businesses[0] : p.businesses
    const branch = Array.isArray(p.branches)   ? p.branches[0]   : p.branches

    return [
      p.full_name ?? '',
      p.email     ?? '',
      p.phone     ?? '',
      ROLE_LABELS[p.role] ?? p.role ?? '',
      biz?.name      ?? '',
      biz ? `${biz.subdomain}.repairbooking.co.uk` : '',
      branch?.name   ?? '',
      p.is_active ? 'Yes' : 'No',
      fmtDate(p.created_at),
    ]
  })

  // ── Create workbook ────────────────────────────────────────────────────────

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])

  ws['!cols'] = [
    { wch: 24 }, // Full Name
    { wch: 30 }, // Email
    { wch: 16 }, // Phone
    { wch: 18 }, // Role
    { wch: 30 }, // Business Name
    { wch: 36 }, // Subdomain
    { wch: 22 }, // Branch
    { wch: 8  }, // Active
    { wch: 14 }, // Joined
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Users')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `users-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export const GET = withMiddleware(handler, { requiredRole: 'super_admin', skipTenant: true })
