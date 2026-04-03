/**
 * GET /api/portal/me?token=xxx
 * Returns the authenticated customer's profile.
 */
import { NextRequest, NextResponse } from 'next/server'
import { adminSupabase } from '@/backend/config/supabase'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await adminSupabase
    .from('customer_portal_sessions')
    .select('customer_id, business_id, expires_at, customers(id, first_name, last_name, email, phone), businesses(name, currency)')
    .eq('token', token)
    .single()

  if (!session) return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
  if (new Date(session.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 })
  }

  return NextResponse.json({ data: { customer: session.customers, business: session.businesses } })
}
