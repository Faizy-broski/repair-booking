/**
 * Supabase Admin Client (SERVICE ROLE)
 * ⚠️  NEVER import this in client-side code or components.
 * This file is exclusively used in /app/api/ route handlers (server-side).
 * The service role key bypasses all Row Level Security policies.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type AdminClient = ReturnType<typeof createClient<Database>>

/**
 * Creates a fresh service-role client, reading env vars at call time.
 * Use SUPABASE_URL (server-only) first to avoid Next.js NEXT_PUBLIC_ compile-
 * time inlining that can bake in stale placeholder values.
 */
export function getAdminSupabase(): AdminClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export const createAdminClient = getAdminSupabase

/**
 * Drop-in proxy — existing code using `adminSupabase.from(...)` continues to
 * work while env vars are read fresh on every property access.
 */
export const adminSupabase = new Proxy({} as AdminClient, {
  get(_target, prop) {
    const client = getAdminSupabase()
    const value = (client as Record<string, unknown>)[prop as string]
    return typeof value === 'function' ? (value as Function).bind(client) : value
  },
})
