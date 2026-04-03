/**
 * GET /api/portal/tickets?token=xxx
 * Returns all repairs for the authenticated portal customer.
 */
import { NextRequest, NextResponse } from 'next/server'
import { adminSupabase } from '@/backend/config/supabase'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await adminSupabase
    .from('customer_portal_sessions')
    .select('customer_id, business_id, expires_at')
    .eq('token', token)
    .single()

  if (!session || new Date(session.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: repairs, error } = await adminSupabase
    .from('repairs')
    .select('id, job_number, status, device_type, device_brand, device_model, issue, estimated_cost, actual_cost, deposit_paid, created_at, updated_at, collected_at, branches(name)')
    .eq('customer_id', session.customer_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: repairs ?? [] })
}
