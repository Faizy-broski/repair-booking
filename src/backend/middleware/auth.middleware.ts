import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { unauthorized } from '@/backend/utils/api-response'
import { adminSupabase } from '@/backend/config/supabase'
import { verifyImpersonationJwt } from '@/lib/impersonation'

export interface AuthContext {
  userId: string
  role: string
  businessId: string | null
  branchId: string | null
}

// Token cache: maps access_token → userId, TTL 55 min (tokens live 1 hr).
// getUser() is a network call to Supabase Auth — this cache means we pay that
// cost once per token lifetime instead of once per request.
// On cache miss we call getUser() which cryptographically validates the JWT
// server-side, preserving Supabase's security guarantee.
const tokenCache = new Map<string, { userId: string; expires: number }>()
const TOKEN_TTL_MS = 55 * 60 * 1000

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
  // ── Impersonation short-circuit ──────────────────────────────────────────
  // Primary path: x-imp-user-id injected by middleware.ts after JWT verification.
  // Fallback path: read sb-imp-session cookie directly (Node.js route handlers
  // can read httpOnly cookies; this is resilient to any Edge→Node header forwarding gaps).
  const impUserId = request.headers.get('x-imp-user-id')
    ?? await (async () => {
      const cookie = request.cookies.get('sb-imp-session')?.value
      if (!cookie) return null
      const payload = await verifyImpersonationJwt(cookie)
      return payload?.targetUserId ?? null
    })()

  if (impUserId) {
    const now = Date.now()
    const cached = profileCache.get(impUserId)
    if (cached && cached.expires > now) {
      return { context: { userId: impUserId, ...cached.ctx }, error: null }
    }
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('role, business_id, branch_id')
      .eq('id', impUserId)
      .single()
    if (!profile) return { context: null, error: unauthorized('Impersonation target not found') }
    const ctx = { role: profile.role, businessId: profile.business_id, branchId: profile.branch_id }
    profileCache.set(impUserId, { ctx, expires: now + PROFILE_TTL_MS })
    return { context: { userId: impUserId, ...ctx }, error: null }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
  )

  // getSession() is local-only (reads + decodes the cookie) — zero network calls.
  // We use it only to extract the access_token so we can key the token cache.
  // We do NOT trust session.user from here (that's the insecure part Supabase warns about).
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return { context: null, error: unauthorized() }

  const now = Date.now()

  // Token cache hit: we've already verified this token with Supabase Auth server
  // recently — skip the network call.
  const tokenHit = tokenCache.get(session.access_token)
  let userId: string

  if (tokenHit && tokenHit.expires > now) {
    userId = tokenHit.userId
  } else {
    // Cache miss: call getUser() which validates the JWT with the Supabase Auth
    // server — this is the secure path Supabase recommends.
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return { context: null, error: unauthorized() }
    userId = user.id
    tokenCache.set(session.access_token, { userId, expires: now + TOKEN_TTL_MS })
  }

  // Profile lookup (cached 2 min — avoids DB hit on every request)
  const cached = profileCache.get(userId)
  if (cached && cached.expires > now) {
    return { context: { userId, ...cached.ctx }, error: null }
  }

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role, business_id, branch_id')
    .eq('id', userId)
    .single()

  if (!profile) return { context: null, error: unauthorized('Profile not found') }

  const ctx = { role: profile.role, businessId: profile.business_id, branchId: profile.branch_id }
  profileCache.set(userId, { ctx, expires: now + PROFILE_TTL_MS })

  return { context: { userId, ...ctx }, error: null }
}
