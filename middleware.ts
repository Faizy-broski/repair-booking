import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_PATHS = ['/api/auth/', '/api/webhooks/', '/api/public/', '/book/', '/_next/', '/favicon.ico', '/images/']
const SUPERADMIN_SUBDOMAIN = 'admin'
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'repairbooking.co.uk'

// In production, scope auth cookies to the root domain so they are shared
// across all tenant subdomains (techfix.repairpos.tech, admin.repairpos.tech, etc.)
const COOKIE_OPTIONS = process.env.NODE_ENV === 'production'
  ? { domain: `.${ROOT_DOMAIN}`, path: '/', sameSite: 'lax' as const, secure: true }
  : undefined

// App routes that require tenant context — protected on root domain
const TENANT_ROUTES = [
  '/dashboard', '/repairs', '/pos', '/customers', '/inventory',
  '/employees', '/reports', '/invoices', '/appointments', '/messages',
  '/expenses', '/gift-cards', '/settings', '/phone', '/google-reviews', '/account',
]

function getSubdomain(host: string): string | null {
  const cleanHost = host.split(':')[0]
  if (cleanHost === ROOT_DOMAIN || cleanHost === `www.${ROOT_DOMAIN}`) return null
  if (cleanHost === 'localhost') return null
  if (cleanHost.endsWith('.localhost')) return cleanHost.replace('.localhost', '')
  if (cleanHost.endsWith(`.${ROOT_DOMAIN}`)) return cleanHost.replace(`.${ROOT_DOMAIN}`, '')
  return null
}

/**
 * Copy Supabase-managed auth cookies onto any response we return.
 * Required so refreshed access tokens reach the browser and sessions
 * don't silently expire after ~1 hour.
 */
function forwardAuthCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach(({ name, value, ...attrs }) => {
    to.cookies.set(name, value, attrs as Parameters<typeof to.cookies.set>[2])
  })
  return to
}

/**
 * Stamp Cache-Control: no-store on any response that serves a protected page.
 * This prevents the browser from serving a cached version when the user presses
 * the Back button after logout — without it, the cached dashboard HTML renders
 * briefly before client-side auth checks kick in.
 */
function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  return res
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = request.headers.get('host') || ''

  // ── Skip static / public API paths ──────────────────────────────────────
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // ── Build Supabase client ────────────────────────────────────────────────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              ...(COOKIE_OPTIONS ?? {}),
            })
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  function redirectToLogin(loginPath: string): NextResponse {
    const url = new URL(request.url)
    url.pathname = loginPath
    url.searchParams.set('redirectTo', pathname)
    return forwardAuthCookies(supabaseResponse, NextResponse.redirect(url))
  }

  const subdomain = getSubdomain(host)

  // ── SuperAdmin portal (admin.domain) ─────────────────────────────────────
  if (subdomain === SUPERADMIN_SUBDOMAIN) {
    // Auth pages that must be accessible without a session
    if (
      pathname.startsWith('/login') ||
      pathname.startsWith('/forgot-password') ||
      pathname.startsWith('/reset-password')
    ) {
      return forwardAuthCookies(supabaseResponse, NextResponse.next({ request }))
    }
    if (!user) return redirectToLogin('/login')

    // ── Role enforcement: admin subdomain is exclusively for super_admins ────
    // Hard server-side gate: tenant users must not access this portal even if
    // their auth cookie is valid on this origin (shared localhost in dev or
    // shared root domain in prod). Sign them out immediately and send them back
    // to the login page with a clear error so they can use the correct subdomain.
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (!adminProfile || adminProfile.role !== 'super_admin') {
      await supabase.auth.signOut()
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'not_superadmin')
      return forwardAuthCookies(supabaseResponse, NextResponse.redirect(loginUrl))
    }

    // API routes must pass through as-is — redirecting them to /superadmin/api/...
    // would 404 because there are no routes under that path.
    if (pathname.startsWith('/api/')) {
      return forwardAuthCookies(supabaseResponse, NextResponse.next({ request }))
    }

    // If already on /superadmin/* — pass through normally (no rewrite needed).
    if (pathname.startsWith('/superadmin')) {
      return forwardAuthCookies(supabaseResponse, NextResponse.next({ request }))
    }

    // Redirect clean URL to the real /superadmin/* route so the browser URL
    // matches the file-system route. This avoids the hydration mismatch caused
    // by NextResponse.rewrite() where the client router sees "/dashboard" and
    // loads the (tenant) route group instead of the superadmin layout.
    const target = pathname === '/' ? '/superadmin/dashboard' : `/superadmin${pathname}`
    return forwardAuthCookies(
      supabaseResponse,
      NextResponse.redirect(new URL(target, request.url))
    )
  }

  // ── Tenant portal (techfix.domain, etc.) ─────────────────────────────────
  if (subdomain) {
    const tenantSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: COOKIE_OPTIONS,
        cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
      }
    )

    const { data: business } = await tenantSupabase
      .from('businesses')
      .select('id, is_active, is_suspended')
      .eq('subdomain', subdomain)
      .single()

    if (!business) {
      const marketingUrl = process.env.NODE_ENV === 'development'
        ? new URL('/', `http://localhost:${request.nextUrl.port || '3000'}`)
        : new URL('/', `https://${ROOT_DOMAIN}`)
      return NextResponse.redirect(marketingUrl)
    }

    // ── Suspension / deactivation gate ───────────────────────────────────────
    // A business is blocked when is_active = false OR is_suspended = true.
    // The check runs before login so that suspended tenants cannot authenticate.
    // We redirect to /login?error=suspended rather than a separate page so the
    // user always has a visible, styled error without requiring an extra route.
    const isBusinessBlocked = !business.is_active || business.is_suspended
    if (isBusinessBlocked) {
      // Allow login and password-reset pages through (otherwise we create redirect loops)
      if (
        pathname.startsWith('/login') ||
        pathname.startsWith('/forgot-password') ||
        pathname.startsWith('/reset-password')
      ) {
        return forwardAuthCookies(supabaseResponse, NextResponse.next({ request }))
      }
      // Sign the user out if they have an active session, so the stale session
      // doesn't let them access the tenant API routes.
      if (user) {
        await supabase.auth.signOut()
      }
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'suspended')
      return forwardAuthCookies(supabaseResponse, NextResponse.redirect(loginUrl))
    }

    // Auth + password-reset pages — pass through without requiring an existing session.
    // /forgot-password and /reset-password must be accessible unauthenticated so users
    // can initiate and complete a password reset from any device.
    if (
      pathname.startsWith('/login') ||
      pathname.startsWith('/register') ||
      pathname.startsWith('/forgot-password') ||
      pathname.startsWith('/reset-password')
    ) {
      if (user) {
        const { data: loginProfile } = await supabase
          .from('profiles')
          .select('role, business_id')
          .eq('id', user.id)
          .maybeSingle()

        if (loginProfile?.role === 'super_admin') {
          // Super admin visiting a tenant login while already authenticated:
          // redirect them straight to the admin portal — do NOT destroy their
          // session, they simply ended up on the wrong subdomain.
          const adminOrigin =
            process.env.NODE_ENV === 'development'
              ? `http://${SUPERADMIN_SUBDOMAIN}.localhost:${request.nextUrl.port || '3000'}`
              : `https://${SUPERADMIN_SUBDOMAIN}.${ROOT_DOMAIN}`
          return forwardAuthCookies(
            supabaseResponse,
            NextResponse.redirect(new URL('/superadmin/dashboard', adminOrigin))
          )
        }

        if (loginProfile && loginProfile.business_id !== business.id) {
          await supabase.auth.signOut()
        }
      }
      return forwardAuthCookies(supabaseResponse, NextResponse.next({ request }))
    }

    // All other routes require authentication
    if (!user) return redirectToLogin('/login')

    // ── Tenant isolation: verify this user belongs to THIS business ──────────
    // Prevents a user from business A accessing business B's subdomain.
    // Uses the main `supabase` client (which has proper cookie setters) so that
    // calling signOut() actually clears the session cookies in the response.
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('business_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!userProfile || userProfile.business_id !== business.id) {
      // Sign the user OUT so the stale cross-tenant session is destroyed.
      // forwardAuthCookies will carry the cleared session cookies to the browser.
      await supabase.auth.signOut()
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'wrong_tenant')
      return forwardAuthCookies(supabaseResponse, NextResponse.redirect(loginUrl))
    }

    // ── Trial / subscription enforcement ─────────────────────────────────
    // Skip enforcement on account page, its API, stripe routes, and upgrade page
    const isExemptPath =
      pathname.startsWith('/account') ||
      pathname.startsWith('/api/account/') ||
      pathname.startsWith('/api/stripe/') ||
      pathname.startsWith('/upgrade')

    if (!isExemptPath) {
      const { data: sub } = await tenantSupabase
        .from('subscriptions')
        .select('status, trial_ends_at, plans(plan_type)')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const planType = (sub?.plans as { plan_type?: string } | null)?.plan_type

      const freeTrialExpired =
        planType === 'free' &&
        sub?.trial_ends_at &&
        new Date(sub.trial_ends_at) < new Date()

      const paidSubInactive =
        planType === 'paid' &&
        sub?.status &&
        !['active', 'trialing'].includes(sub.status)

      if (freeTrialExpired || paidSubInactive) {
        const accountUrl = new URL('/account', request.url)
        return forwardAuthCookies(supabaseResponse, NextResponse.redirect(accountUrl))
      }
    }

    // Inject tenant context into request headers.
    // Read by tenantMiddleware via request.headers.get('x-business-id').
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-business-id', business.id)
    requestHeaders.set('x-subdomain', subdomain)

    // ── NO REWRITE — pages are now at (tenant)/dashboard etc. ──────────────
    // The (tenant) route group serves /dashboard, /repairs, etc. directly.
    // We only need to forward the enriched headers.
    // noStore() prevents the browser from caching this response so pressing
    // Back after logout never shows a stale authenticated page.
    return noStore(
      forwardAuthCookies(
        supabaseResponse,
        NextResponse.next({ request: { headers: requestHeaders } })
      )
    )
  }

  // ── Root domain / marketing site ─────────────────────────────────────────
  // Block direct access to app routes on the root domain (no tenant context).
  const isTenantRoute = TENANT_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + '/')
  )
  if (isTenantRoute) {
    // Authenticated user: redirect them to their subdomain
    if (user) {
      // Look up their business subdomain
      const { data: profile } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', user.id)
        .single()

      if (profile?.business_id) {
        const { data: biz } = await supabase
          .from('businesses')
          .select('subdomain')
          .eq('id', profile.business_id)
          .single()

        if (biz?.subdomain) {
          const url = new URL(request.url)
          const baseHost = url.hostname === 'localhost'
            ? (url.port ? `localhost:${url.port}` : 'localhost')
            : ROOT_DOMAIN.split(':')[0]
          return NextResponse.redirect(
            new URL(pathname, `${url.protocol}//${biz.subdomain}.${baseHost}`)
          )
        }
      }
    }
    // Unauthenticated: send to login
    return redirectToLogin('/login')
  }

  if (pathname.startsWith('/superadmin') && !user) {
    return redirectToLogin('/login')
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
