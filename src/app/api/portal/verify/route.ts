/**
 * POST /api/portal/verify
 * Body: { email: string, subdomain: string, otp: string }
 *
 * Validates the OTP and returns a session token.
 */
import { NextRequest, NextResponse } from 'next/server'
import { adminSupabase } from '@/backend/config/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email     = body?.email?.trim().toLowerCase()
  const subdomain = body?.subdomain?.trim()
  const otp       = body?.otp?.trim()

  if (!email || !subdomain || !otp) {
    return NextResponse.json({ error: 'email, subdomain, and otp are required' }, { status: 400 })
  }

  // Resolve business
  const { data: biz } = await adminSupabase
    .from('businesses')
    .select('id')
    .eq('subdomain', subdomain)
    .eq('is_active', true)
    .single()

  if (!biz) return NextResponse.json({ error: 'Invalid code' }, { status: 401 })

  // Find customer
  const { data: customer } = await adminSupabase
    .from('customers')
    .select('id')
    .eq('business_id', biz.id)
    .ilike('email', email)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Invalid code' }, { status: 401 })

  // Validate OTP
  const { data: session } = await adminSupabase
    .from('customer_portal_sessions')
    .select('id, token, otp, otp_expires, expires_at')
    .eq('customer_id', customer.id)
    .eq('business_id', biz.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Invalid code' }, { status: 401 })
  if (session.otp !== otp) return NextResponse.json({ error: 'Incorrect code' }, { status: 401 })
  if (!session.otp_expires || new Date(session.otp_expires) < new Date()) {
    return NextResponse.json({ error: 'Code has expired. Please request a new one.' }, { status: 401 })
  }

  // Clear OTP (used once) and refresh expires_at
  await adminSupabase
    .from('customer_portal_sessions')
    .update({ otp: null, otp_expires: null, expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() })
    .eq('id', session.id)

  return NextResponse.json({ token: session.token })
}
