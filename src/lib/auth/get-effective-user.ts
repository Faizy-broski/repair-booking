import { headers, cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { verifyImpersonationJwt } from '@/lib/impersonation'

/**
 * Returns the effective user ID for the current request.
 *
 * Resolution order:
 * 1. x-imp-user-id header — set by middleware for tenant-subdomain requests
 * 2. sb-imp-session cookie — fallback when middleware didn't forward headers
 *    (root domain requests, admin-subdomain API pass-through, etc.)
 * 3. Supabase session cookie — normal authenticated user
 */
export async function getEffectiveUserId(): Promise<string | null> {
  const h = await headers()

  // 1. Header set by middleware (fast path for tenant-subdomain requests)
  const impUserId = h.get('x-imp-user-id')
  if (impUserId) return impUserId

  // 2. Cookie fallback — covers cases where the request hits the root domain
  //    or the admin subdomain where middleware doesn't inject impersonation headers
  const cookieStore = await cookies()
  const impCookie = cookieStore.get('sb-imp-session')?.value
  if (impCookie) {
    const payload = await verifyImpersonationJwt(impCookie)
    if (payload?.targetUserId) return payload.targetUserId
  }

  // 3. Normal Supabase session
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user.id
}
