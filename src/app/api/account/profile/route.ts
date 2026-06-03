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

async function patchProfile(request: NextRequest, ctx: RequestContext) {
  try {
    const body = await request.json()
    const allowed = ['tour_completed'] as const
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }
    if (Object.keys(update).length === 0) return ok({})
    const { data, error } = await adminSupabase
      .from('profiles')
      .update(update)
      .eq('id', ctx.auth.userId)
      .select('*')
      .single()
    if (error) throw error
    return ok(data)
  } catch (err) {
    return serverError('Failed to update profile', err)
  }
}

export const GET   = withMiddleware(getProfile)
export const PATCH = withMiddleware(patchProfile)
