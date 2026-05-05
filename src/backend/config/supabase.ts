/**
 * Supabase Admin Client (SERVICE ROLE)
 * ⚠️  NEVER import this in client-side code or components.
 * This file is exclusively used in /app/api/ route handlers (server-side).
 * The service role key bypasses all Row Level Security policies.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type AdminClient = ReturnType<typeof createClient<Database>>

// Singleton instance — created once per Node.js process and reused across all
// requests. Creating a new client on every property access (the old Proxy
// behaviour) caused a fresh TLS/HTTP connection per query, which is why all
// employee endpoints were taking 13+ seconds.
let _adminClient: AdminClient | null = null

export function getAdminSupabase(): AdminClient {
  if (_adminClient) return _adminClient
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  }
  _adminClient = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _adminClient
}

export const createAdminClient = getAdminSupabase

// Proxy kept for backward compatibility — all existing `adminSupabase.from(...)`
// calls continue to work, but now delegate to the singleton client.
export const adminSupabase = new Proxy({} as AdminClient, {
  get(_target, prop) {
    const client = getAdminSupabase()
    const value = (client as Record<string, unknown>)[prop as string]
    return typeof value === 'function' ? (value as Function).bind(client) : value
  },
})
