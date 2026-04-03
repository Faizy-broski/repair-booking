import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  const isProd = process.env.NODE_ENV === 'production'
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    isProd && rootDomain
      ? {
          cookieOptions: {
            domain: `.${rootDomain}`,  // .repairpos.tech — shared across all subdomains
            path: '/',
            sameSite: 'lax',
            secure: true,
          },
        }
      : undefined
  )
}
