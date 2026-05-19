import { createClient } from '@/lib/supabase/client'
import { queryClient } from '@/lib/query-client'

/**
 * Single source of truth for sign-out.
 *
 * Order matters:
 * 1. Supabase session revoked first (blocks any in-flight auth'd requests)
 * 2. React Query cache cleared (prevents cross-user data bleed — gcTime is 1h)
 * 3. Persisted localStorage stores wiped (dashboard stats, module configs)
 * 4. Full page unload — destroys all in-memory Zustand state (POS cart, messages, etc.)
 *
 * We intentionally do NOT call useAuthStore.clear() before navigating because:
 * - window.location.href triggers a full unload which resets in-memory state anyway
 * - Calling clear() causes the sidebar to briefly re-render with null profile (visual flash)
 */
export async function performSignOut(redirectTo = '/login'): Promise<void> {
  const supabase = createClient()

  // 1. Revoke Supabase session (removes sb-* keys from localStorage)
  await supabase.auth.signOut({ scope: 'local' })

  // 2. Nuke React Query cache — critical for preventing cross-user data exposure
  queryClient.clear()

  // 3. Clear persisted stores that survive page unload
  try {
    localStorage.removeItem('dashboard-storage')
    localStorage.removeItem('module-config-storage')
  } catch {
    // localStorage unavailable in some embedded contexts — safe to ignore
  }

  // 4. Full page navigation — destroys all in-memory React/Zustand state
  const appUrl = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_APP_URL ?? '') : ''
  const target = redirectTo.startsWith('http') ? redirectTo : `${appUrl}${redirectTo}`
  window.location.href = target
}
