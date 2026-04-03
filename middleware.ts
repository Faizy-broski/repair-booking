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
  '/expenses', '/gift-cards', '/settings', '/phone', '/google-reviews',
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
    if (pathname.startsWith('/login')) {
      return forwardAuthCookies(supabaseResponse, NextResponse.next({ request }))
    }
    if (!user) return redirectToLogin('/login')

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

    if (business.is_suspended) {
      return forwardAuthCookies(
        supabaseResponse,
        NextResponse.rewrite(new URL('/suspended', request.url), {
          request: { headers: new Headers(request.headers) },
        })
      )
    }

    // Auth pages — pass through so login/register work on the subdomain
    if (pathname.startsWith('/login') || pathname.startsWith('/register')) {
      return forwardAuthCookies(supabaseResponse, NextResponse.next({ request }))
    }

    // All other routes require authentication
    if (!user) return redirectToLogin('/login')

    // Inject tenant context into request headers.
    // Read by tenantMiddleware via request.headers.get('x-business-id').
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-business-id', business.id)
    requestHeaders.set('x-subdomain', subdomain)

    // ── NO REWRITE — pages are now at (tenant)/dashboard etc. ──────────────
    // The (tenant) route group serves /dashboard, /repairs, etc. directly.
    // We only need to forward the enriched headers.
    return forwardAuthCookies(
      supabaseResponse,
      NextResponse.next({ request: { headers: requestHeaders } })
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
