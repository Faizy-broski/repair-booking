/**
 * POST /api/users/verify-pin
 * Body: { pin: string }
 *
 * Validates the PIN against the authenticated user's employee record.
 * Returns 200 on match, 401 on mismatch/not-set.
 */
import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { NextRequest, NextResponse } from 'next/server'
import type { RequestContext } from '@/backend/middleware'

async function verifyPin(req: NextRequest, ctx: RequestContext) {
  const body = await req.json().catch(() => null)
  const pin = body?.pin?.trim()
  if (!pin) return NextResponse.json({ error: 'PIN is required' }, { status: 400 })

  // Look up the employee record for the current user
  const { data: employee } = await adminSupabase
    .from('employees')
    .select('id, access_pin')
    .eq('profile_id', ctx.auth.userId)
    .maybeSingle()

  if (!employee?.access_pin) {
    return NextResponse.json({ error: 'No PIN set. Ask a manager to set your PIN in employee settings.' }, { status: 401 })
  }

  if (employee.access_pin !== pin) {
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withMiddleware(verifyPin, { requiredRole: 'cashier' })
