import { withMiddleware } from '@/backend/middleware'
import { adminSupabase } from '@/backend/config/supabase'
import { ok, serverError } from '@/backend/utils/api-response'
import type { RequestContext } from '@/backend/middleware'
import type { NextRequest } from 'next/server'

async function getProfile(request: NextRequest, ctx: RequestContext) {
  try {
    const { data: profile, error } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('id', ctx.auth.userId)
      .single()
    if (error) throw error
    return ok(profile)
  } catch (err) {
    return serverError('Failed to fetch profile', err)
  }
}

export const GET = withMiddleware(getProfile)
