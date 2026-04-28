import { NextRequest } from 'next/server'
import { createHmac, randomInt } from 'crypto'
import { z } from 'zod'
import { createAdminClient } from '@/backend/config/supabase'
import { EmailService } from '@/backend/services/email.service'
import { ok, badRequest, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'

const schema = z.object({ email: z.string().email() })

const OTP_EXPIRY_MINUTES = 15
const RATE_LIMIT_WINDOW_MINUTES = 10
const RATE_LIMIT_MAX_SENDS = 30
const MAX_ATTEMPTS = 5

function hashOtp(otp: string, email: string): string {
  const secret = process.env.OTP_SECRET ?? 'fallback-dev-secret-change-in-prod'
  return createHmac('sha256', secret).update(`${otp}:${email.toLowerCase()}`).digest('hex')
}

export async function POST(request: NextRequest) {
  const { data, error } = await validateBody(request, schema)
  if (error) return error

  const email = data.email.toLowerCase()

  try {
    const supabase = createAdminClient()
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()

    // Rate limit: max 3 sends per email per 10 minutes
    const { count } = await (supabase as any)
      .from('email_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', windowStart)

    if ((count ?? 0) >= RATE_LIMIT_MAX_SENDS) {
      return badRequest(`Too many requests. Please wait before requesting a new code.`, 'RATE_LIMITED')
    }

    // Invalidate any existing unexpired OTPs for this email
    const now = new Date().toISOString()
    await (supabase as any)
      .from('email_verifications')
      .update({ expires_at: now })
      .eq('email', email)
      .is('verified_at', null)
      .gt('expires_at', now)

    // Generate a 6-digit OTP
    const otp = String(randomInt(100000, 999999))
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString()

    await (supabase as any)
      .from('email_verifications')
      .insert({
        email,
        otp_hash: hashOtp(otp, email),
        expires_at: expiresAt,
        attempt_count: 0,
      })

    // Fire-and-forget — don't leak whether send succeeded to avoid email enumeration
    EmailService.sendOtp({ to: email, otp, expiresInMinutes: OTP_EXPIRY_MINUTES }).catch((err) => console.error('[send-otp] SMTP error:', err))

    return ok({ sent: true })
  } catch (err) {
    return serverError('Failed to send verification code', err)
  }
}
