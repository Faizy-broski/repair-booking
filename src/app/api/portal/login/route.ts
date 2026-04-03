/**
 * POST /api/portal/login
 * Body: { email: string, subdomain: string }
 *
 * Looks up the customer by email+business, generates a 6-digit OTP,
 * sends it via email, returns { sent: true }.
 * No auth required — public endpoint.
 */
import { NextRequest, NextResponse } from 'next/server'
import { adminSupabase } from '@/backend/config/supabase'
import { EmailService } from '@/backend/services/email.service'

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email     = body?.email?.trim().toLowerCase()
  const subdomain = body?.subdomain?.trim()

  if (!email || !subdomain) {
    return NextResponse.json({ error: 'email and subdomain are required' }, { status: 400 })
  }

  // Resolve business
  const { data: biz } = await adminSupabase
    .from('businesses')
    .select('id, name')
    .eq('subdomain', subdomain)
    .eq('is_active', true)
    .single()

  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Find customer by email in this business
  const { data: customer } = await adminSupabase
    .from('customers')
    .select('id, first_name, email')
    .eq('business_id', biz.id)
    .ilike('email', email)
    .maybeSingle()

  // Always return sent:true to prevent email enumeration
  if (!customer) {
    return NextResponse.json({ sent: true })
  }

  const otp = generateOtp()
  const otpExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min

  // Generate a session token and upsert the portal session
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0')).join('')

  await adminSupabase
    .from('customer_portal_sessions')
    .upsert(
      {
        business_id: biz.id,
        customer_id: customer.id,
        token,
        otp,
        otp_expires: otpExpires,
        expires_at:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'customer_id,business_id' }
    )

  // Send OTP email
  await EmailService.sendTemplated({
    to: customer.email!,
    subject: `Your ${biz.name} login code`,
    fromName: biz.name,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1e3a5f">Your one-time login code</h2>
        <p>Hi ${customer.first_name},</p>
        <p>Use the code below to access your repair portal. It expires in 15 minutes.</p>
        <div style="background:#f0f4ff;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
          <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#3b82f6">${otp}</span>
        </div>
        <p style="color:#6b7280;font-size:14px">If you did not request this, you can safely ignore this email.</p>
        <p style="color:#6b7280;font-size:14px">— ${biz.name}</p>
      </div>
    `,
  }).catch(console.error)

  return NextResponse.json({ sent: true })
}
