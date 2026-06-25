import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { verifyImpersonationJwt } from '@/lib/impersonation'

const PUBLIC_PATHS = ['/api/auth/', '/api/webhooks/', '/api/public/', '/book/', '/_next/', '/favicon.ico', '/images/', '/api/google-reviews/oauth/callback']

// Cache business existence checks so we don't hit the DB on every request.
// Business records change rarely (creation, suspension). The cache expires
// after 5 minutes — an acceptable delay for status changes on a VPS deployment.
const businessCache = new Map<string, { id: string; is_active: boolean; is_suspended: boolean; cachedAt: number }>()
const BUSINESS_CACHE_TTL_MS = 5 * 60 * 1000
const SUPERADMIN_SUBDOMAIN = 'admin'
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'repairbooking.co.uk'

// In production, scope auth cookies to the root domain so they are shared
// across all tenant subdomains (techfix.repairbooking.co.uk, admin.repairbooking.co.uk, etc.)
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
  // Respect the original host passed by reverse proxies in production
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''

  // ── Strip headers that must only be set by this middleware ───────────────
  // Prevents clients from forging impersonation or tenant context headers.
  // We build a mutable copy here and use it for all downstream NextResponse.next() calls.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-imp-user-id')
  requestHeaders.delete('x-is-impersonating')
  requestHeaders.delete('x-business-id')
  requestHeaders.delete('x-subdomain')

  // ── Skip static / public API paths ──────────────────────────────────────
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next({ request: { headers: requestHeaders } })
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

  // getSession() reads + locally verifies the JWT from cookies — zero network calls
  // in the common case (fresh token). The subsequent DB queries (profile.business_id
  // check, subscription check) provide the real security validation. getUser() adds
  // an extra round-trip to Supabase Auth on every request (~80-200 ms on a VPS).
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user ?? null

  function redirectToLogin(loginPath: string): NextResponse {
    const url = new URL(request.url)
    url.pathname = loginPath
    // If the requested path is the root ('/'), redirect to /dashboard after login
    // so users don't land on the marketing homepage instead of the app.
    const redirectTarget = pathname === '/' ? '/dashboard' : pathname
    url.searchParams.set('redirectTo', redirectTarget)
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
      await supabase.auth.signOut({ scope: 'local' })
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
    // Business existence check uses an anonymous (cookieless) client so that
    // a logged-in user from a different tenant doesn't hit an RLS rejection
    // on the businesses table, which would incorrectly return null and
    // redirect to the marketing homepage.
    const anonSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    )

    // Authenticated client (no cookie setters) used later for subscription check.
    // Only constructed after the user is verified to belong to this business.
    const tenantSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: COOKIE_OPTIONS,
        cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
      }
    )

    const cached = businessCache.get(subdomain)
    let business: { id: string; is_active: boolean; is_suspended: boolean } | null = null
    if (cached && Date.now() - cached.cachedAt < BUSINESS_CACHE_TTL_MS) {
      const { cachedAt: _t, ...rest } = cached
      business = rest
    } else {
      const { data } = await anonSupabase
        .from('businesses')
        .select('id, is_active, is_suspended')
        .eq('subdomain', subdomain)
        .single()
      business = data
      if (data) businessCache.set(subdomain, { ...data, cachedAt: Date.now() })
    }

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
        await supabase.auth.signOut({ scope: 'local' })
      }
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'suspended')
      return forwardAuthCookies(supabaseResponse, NextResponse.redirect(loginUrl))
    }

    // /register on a tenant subdomain makes no sense — new businesses must sign up
    // at the root domain. Redirect unauthenticated visitors there immediately.
    if (pathname.startsWith('/register') && !user) {
      const rootRegisterUrl = process.env.NODE_ENV === 'development'
        ? new URL('/register', `http://localhost:${request.nextUrl.port || '3000'}`)
        : new URL('/register', `https://${ROOT_DOMAIN}`)
      return NextResponse.redirect(rootRegisterUrl)
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
          // Super admin visiting a tenant login page: let them through so they
          // can view or access the tenant portal. Do NOT redirect back to the
          // admin portal — that prevents super admins from ever opening a tenant link.
          return forwardAuthCookies(supabaseResponse, NextResponse.next({ request }))
        }

        if (loginProfile && loginProfile.business_id !== business.id) {
          await supabase.auth.signOut({ scope: 'local' })
        }
      }
      return forwardAuthCookies(supabaseResponse, NextResponse.next({ request }))
    }

    // ── Impersonation session check ──────────────────────────────────────────
    // Checked BEFORE normal auth so superadmin can access tenant dashboard
    // without their shared-domain session being overwritten.
    const impCookie = request.cookies.get('sb-imp-session')?.value
    if (impCookie) {
      const impPayload = await verifyImpersonationJwt(impCookie)
      if (impPayload && impPayload.subdomain === subdomain && impPayload.businessId === business.id) {
        const impHeaders = new Headers(requestHeaders)
        impHeaders.set('x-business-id', business.id)
        impHeaders.set('x-subdomain', subdomain)
        impHeaders.set('x-imp-user-id', impPayload.targetUserId)
        impHeaders.set('x-is-impersonating', 'true')
        return noStore(
          forwardAuthCookies(supabaseResponse, NextResponse.next({ request: { headers: impHeaders } }))
        )
      }
      // Invalid or expired JWT — fall through to normal auth
    }

    // All other routes require authentication
    if (!user) return redirectToLogin('/login')

    // Compute exemption before the parallel fetch so the subscription query
    // can be skipped entirely on paths that never need it.
    const isExemptPath =
      pathname.startsWith('/account') ||
      pathname.startsWith('/api/account/') ||
      pathname.startsWith('/api/stripe/') ||
      pathname.startsWith('/api/modules/') ||
      pathname.startsWith('/api/plans') ||
      pathname.startsWith('/upgrade')

    // ── Parallel fetch: tenant isolation + subscription enforcement ───────────
    // Profile (tenant isolation) and subscription status are independent of each
    // other — run them simultaneously to eliminate one sequential round-trip
    // (~80-120 ms) on every authenticated page load.
    const [{ data: userProfile }, subResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('business_id, role')
        .eq('id', user.id)
        .maybeSingle(),
      isExemptPath
        ? Promise.resolve({ data: null })
        : tenantSupabase
            .from('subscriptions')
            .select('status, trial_ends_at, plans(plan_type)')
            .eq('business_id', business.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
    ])

    // ── Tenant isolation ───────────────────────────────────────────────────────
    // Prevents a user from business A accessing business B's subdomain.
    // Uses the main `supabase` client (which has proper cookie setters) so that
    // calling signOut() actually clears the session cookies in the response.
    if (!userProfile || userProfile.business_id !== business.id) {
      // Super admins have no business_id — don't sign them out, just send them
      // to the tenant login page so their admin session stays intact.
      if (userProfile?.role === 'super_admin') {
        return forwardAuthCookies(
          supabaseResponse,
          NextResponse.redirect(new URL('/login', request.url))
        )
      }
      // Sign the user OUT so the stale cross-tenant session is destroyed.
      await supabase.auth.signOut({ scope: 'local' })
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'wrong_tenant')
      return forwardAuthCookies(supabaseResponse, NextResponse.redirect(loginUrl))
    }

    // ── Trial / subscription enforcement ──────────────────────────────────────
    if (!isExemptPath) {
      const sub = subResult.data
      const planType = (sub?.plans as { plan_type?: string } | null)?.plan_type

      // Free trial expired: free-typed plan whose trial_ends_at has passed
      const freeTrialExpired =
        planType === 'free' &&
        sub?.trial_ends_at &&
        new Date(sub.trial_ends_at) < new Date()

      // Paid subscription inactive: ANY plan (including free-typed plans the user
      // has paid for) where the subscription status is not active/trialing.
      // trial_ends_at being null means it's a paid resubscription, not a trial.
      const paidSubInactive =
        sub?.status &&
        !sub.trial_ends_at &&
        !['active', 'trialing'].includes(sub.status)

      if (freeTrialExpired || paidSubInactive) {
        const accountUrl = new URL('/account', request.url)
        return forwardAuthCookies(supabaseResponse, NextResponse.redirect(accountUrl))
      }
    }

    // Redirect authenticated users who land on '/' to the dashboard so they
    // never see the marketing homepage on a tenant subdomain.
    if (pathname === '/') {
      return forwardAuthCookies(
        supabaseResponse,
        NextResponse.redirect(new URL('/dashboard', request.url))
      )
    }

    // Inject tenant context into request headers (build on the already-stripped headers).
    // Read by tenantMiddleware via request.headers.get('x-business-id').
    const tenantHeaders = new Headers(requestHeaders)
    tenantHeaders.set('x-business-id', business.id)
    tenantHeaders.set('x-subdomain', subdomain)

    // ── NO REWRITE — pages are now at (tenant)/dashboard etc. ──────────────
    // The (tenant) route group serves /dashboard, /repairs, etc. directly.
    // We only need to forward the enriched headers.
    // noStore() prevents the browser from caching this response so pressing
    // Back after logout never shows a stale authenticated page.
    return noStore(
      forwardAuthCookies(
        supabaseResponse,
        NextResponse.next({ request: { headers: tenantHeaders } })
      )
    )
  }

  // ── Root domain / marketing site ─────────────────────────────────────────
  // Supabase sends password-reset (and other auth) codes to the Site URL when the
  // redirectTo in the Dashboard allowlist isn't matched.  The Site URL has no path
  // so the code lands on /?code=<pkce-code>.  Catch it here and forward to the
  // dedicated callback handler so the code is exchanged and the user ends up on
  // /reset-password rather than seeing the homepage with a ?code= in the URL.
  const authCode = request.nextUrl.searchParams.get('code')
  if (!subdomain && pathname === '/' && authCode) {
    const callbackUrl = new URL('/api/auth/callback', request.url)
    callbackUrl.searchParams.set('code', authCode)
    callbackUrl.searchParams.set('next', '/reset-password')
    return NextResponse.redirect(callbackUrl)
  }

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
          const isProd = process.env.NODE_ENV === 'production'
          const baseHost = isProd
            ? ROOT_DOMAIN.split(':')[0]
            : (url.hostname === 'localhost' ? (url.port ? `localhost:${url.port}` : 'localhost') : ROOT_DOMAIN.split(':')[0])
          const protocol = isProd ? 'https:' : url.protocol
          return NextResponse.redirect(
            new URL(pathname, `${protocol}//${biz.subdomain}.${baseHost}`)
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

  // Root domain /login — if user already has an active session, redirect them to
  // their tenant subdomain dashboard so they don't have to re-enter credentials.
  // This catches the case where sign-out didn't fully clear the shared cookie and
  // the user navigates to /login thinking they're logged out.
  if ((pathname === '/login' || pathname.startsWith('/login')) && user) {
    const { data: rootProfile } = await supabase
      .from('profiles')
      .select('business_id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (rootProfile?.role === 'super_admin') {
      const adminOrigin =
        process.env.NODE_ENV === 'development'
          ? `http://${SUPERADMIN_SUBDOMAIN}.localhost:${request.nextUrl.port || '3000'}`
          : `https://${SUPERADMIN_SUBDOMAIN}.${ROOT_DOMAIN}`
      return forwardAuthCookies(
        supabaseResponse,
        NextResponse.redirect(new URL('/superadmin/dashboard', adminOrigin))
      )
    }

    if (rootProfile?.business_id) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('subdomain')
        .eq('id', rootProfile.business_id)
        .maybeSingle()

      if (biz?.subdomain) {
        const url = new URL(request.url)
        const isProd = process.env.NODE_ENV === 'production'
        const baseHost = isProd
          ? ROOT_DOMAIN
          : (url.hostname === 'localhost' ? (url.port ? `localhost:${url.port}` : 'localhost') : ROOT_DOMAIN)
        const protocol = isProd ? 'https:' : url.protocol
        return forwardAuthCookies(
          supabaseResponse,
          NextResponse.redirect(new URL('/dashboard', `${protocol}//${biz.subdomain}.${baseHost}`))
        )
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
