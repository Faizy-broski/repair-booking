import { NextRequest } from 'next/server'
import { createHmac } from 'crypto'
import { z } from 'zod'
import { createAdminClient } from '@/backend/config/supabase'
import { ok, badRequest, serverError } from '@/backend/utils/api-response'
import { validateBody } from '@/backend/utils/validate'

const schema = z.object({
  email: z.string().email(),
  otp:   z.string().length(6).regex(/^\d{6}$/),
})

const MAX_ATTEMPTS = 5

function hashOtp(otp: string, email: string): string {
  const secret = process.env.OTP_SECRET ?? 'fallback-dev-secret-change-in-prod'
  return createHmac('sha256', secret).update(`${otp}:${email.toLowerCase()}`).digest('hex')
}

export async function POST(request: NextRequest) {
  const { data, error } = await validateBody(request, schema)
  if (error) return error

  const email = data.email.toLowerCase()
  const now = new Date().toISOString()

  try {
    const supabase = createAdminClient()

    // Find the latest unexpired, unverified record for this email
    const { data: record, error: fetchErr } = await (supabase as any)
      .from('email_verifications')
      .select('id, otp_hash, attempt_count')
      .eq('email', email)
      .is('verified_at', null)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchErr) return serverError('Verification lookup failed', fetchErr)

    if (!record) {
      return badRequest('Verification code has expired. Please request a new one.', 'OTP_EXPIRED')
    }

    if (record.attempt_count >= MAX_ATTEMPTS) {
      // Expire it so a fresh one must be requested
      await (supabase as any)
        .from('email_verifications')
        .update({ expires_at: now })
        .eq('id', record.id)
      return badRequest('Too many incorrect attempts. Please request a new code.', 'OTP_MAX_ATTEMPTS')
    }

    const expectedHash = hashOtp(data.otp, email)
    if (record.otp_hash !== expectedHash) {
      await (supabase as any)
        .from('email_verifications')
        .update({ attempt_count: record.attempt_count + 1 })
        .eq('id', record.id)

      const remaining = MAX_ATTEMPTS - (record.attempt_count + 1)
      return badRequest(
        remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Incorrect code. No attempts remaining — please request a new code.',
        'OTP_INVALID'
      )
    }

    // Mark as verified
    await (supabase as any)
      .from('email_verifications')
      .update({ verified_at: now })
      .eq('id', record.id)

    return ok({ verified: true })
  } catch (err) {
    return serverError('Verification failed', err)
  }
}
