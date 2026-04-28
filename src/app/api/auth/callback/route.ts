import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'repairbooking.co.uk'
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.NODE_ENV === 'production' ? `https://${ROOT_DOMAIN}` : 'http://localhost:3000')

// Must match the COOKIE_OPTIONS used in middleware.ts and client.ts so that the
// session cookie set here is readable on all subdomains (*.repairbooking.co.uk).
const COOKIE_OPTIONS =
  process.env.NODE_ENV === 'production'
    ? { domain: `.${ROOT_DOMAIN}`, path: '/', sameSite: 'lax' as const, secure: true }
    : undefined

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // For security: only allow relative paths in `next` to prevent open redirects.
  // If someone passes an absolute URL, strip it and fall back to /dashboard.
  const safePath = next.startsWith('/') ? next : '/dashboard'

  // Always redirect back to APP_URL (root domain), not `origin` — because this
  // callback is always hit on the root domain, and session cookies must be set
  // with domain=.repairbooking.co.uk so they propagate to tenant subdomains.
  const destinationBase = APP_URL

  if (code) {
    // Build the redirect response FIRST so Supabase writes session cookies onto
    // it directly (one round-trip — avoids the cookie-not-sent-yet race condition).
    const response = NextResponse.redirect(`${destinationBase}${safePath}`)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: COOKIE_OPTIONS,
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, {
                ...options,
                ...(COOKIE_OPTIONS ?? {}),
              })
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return response
    }

    console.error('[auth/callback] exchangeCodeForSession failed:', error.message)
  }

  // Fallback: send to root domain login with a clear error so it is visible to the user.
  return NextResponse.redirect(`${destinationBase}/login?error=auth_callback_failed`)
}
