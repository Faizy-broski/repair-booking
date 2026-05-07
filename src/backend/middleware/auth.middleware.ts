import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { unauthorized } from '@/backend/utils/api-response'
import { adminSupabase } from '@/backend/config/supabase'

export interface AuthContext {
  userId: string
  role: string
  businessId: string | null
  branchId: string | null
}

// Profile cache: avoids a DB round-trip on every request.
// TTL is short so role/branch changes propagate within 2 minutes.
const profileCache = new Map<string, { ctx: Omit<AuthContext, 'userId'>; expires: number }>()
const PROFILE_TTL_MS = 2 * 60 * 1000

export function invalidateProfileCache(userId: string) {
  profileCache.delete(userId)
}

export async function authMiddleware(
  request: NextRequest
): Promise<{ context: AuthContext; error: null } | { context: null; error: ReturnType<typeof unauthorized> }> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (userError || !user) {
    return { context: null, error: unauthorized() }
  }

  const now = Date.now()
  const cached = profileCache.get(user.id)
  if (cached && cached.expires > now) {
    return { context: { userId: user.id, ...cached.ctx }, error: null }
  }

  // Use admin client so we don't need an extra Supabase auth round-trip for the query
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role, business_id, branch_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return { context: null, error: unauthorized('Profile not found') }
  }

  const ctx = { role: profile.role, businessId: profile.business_id, branchId: profile.branch_id }
  profileCache.set(user.id, { ctx, expires: now + PROFILE_TTL_MS })

  return { context: { userId: user.id, ...ctx }, error: null }
}
