/**
 * GET /api/public/ticket-status?ticket_number=XXX-00001&phone=07700000000&subdomain=techfix
 *
 * Public endpoint — no auth required. Powers the Repair Tracker widget.
 * Rate-limited to 20 req/min.
 */
import { NextRequest, NextResponse } from 'next/server'
import { withPublicMiddleware } from '@/backend/middleware/public.middleware'
import { adminSupabase } from '@/backend/config/supabase'

async function getTicketStatus(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const ticketNumber = searchParams.get('ticket_number')?.trim()
  const phone        = searchParams.get('phone')?.trim().replace(/\s/g, '')
  const subdomain    = searchParams.get('subdomain')?.trim()

  if (!ticketNumber) {
    return NextResponse.json({ error: 'ticket_number is required' }, { status: 400 })
  }

  // Resolve business via subdomain (optional — scope search to the business if provided)
  let businessId: string | null = null
  if (subdomain) {
    const { data: biz } = await adminSupabase
      .from('businesses')
      .select('id')
      .eq('subdomain', subdomain)
      .eq('is_active', true)
      .single()
    if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    businessId = biz.id
  }

  // Build query — join to branches to scope by business if needed
  let q = adminSupabase
    .from('repairs')
    .select(`
      job_number,
      status,
      device_type,
      device_brand,
      device_model,
      issue,
      estimated_cost,
      actual_cost,
      created_at,
      updated_at,
      collected_at,
      customers ( first_name, phone ),
      branches ( name, business_id )
    `)
    .eq('job_number', ticketNumber)

  const { data: repairs, error } = await q

  if (error) return NextResponse.json({ error: 'Failed to fetch ticket' }, { status: 500 })
  if (!repairs || repairs.length === 0) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  }

  // Filter by phone (verify ownership) and optionally by businessId
  const matched = repairs.filter((r: any) => {
    const customerPhone = r.customers?.phone?.replace(/\s/g, '') ?? ''
    const phoneMismatch = phone && customerPhone && customerPhone !== phone
    if (phoneMismatch) return false
    if (businessId && r.branches?.business_id !== businessId) return false
    return true
  })

  if (matched.length === 0) {
    return NextResponse.json({ error: 'Ticket not found or phone number does not match' }, { status: 404 })
  }

  const repair = matched[0] as any
  const STATUS_LABELS: Record<string, string> = {
    received:       'Received',
    in_progress:    'In Progress',
    waiting_parts:  'Waiting for Parts',
    repaired:       'Ready for Collection',
    unrepairable:   'Unrepairable',
    collected:      'Collected',
  }

  return NextResponse.json({
    data: {
      ticket_number: repair.job_number,
      status:        repair.status,
      status_label:  STATUS_LABELS[repair.status] ?? repair.status,
      device:        [repair.device_brand, repair.device_model].filter(Boolean).join(' ') || repair.device_type || 'Device',
      issue:         repair.issue,
      created_at:    repair.created_at,
      updated_at:    repair.updated_at,
      collected_at:  repair.collected_at,
      store_name:    (repair.branches as any)?.name ?? null,
    },
  })
}

export const GET = withPublicMiddleware(getTicketStatus, { rateLimit: 20 })
