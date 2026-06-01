import { NextRequest, NextResponse } from 'next/server'
import { adminSupabase } from '@/backend/config/supabase'
import { signImpersonationJwt } from '@/lib/impersonation'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'repairbooking.co.uk'
const IMP_COOKIE = 'sb-imp-session'
const IMP_UI_COOKIE = 'sb-imp-ui' // non-httpOnly, carries business name for the banner

function extractSubdomain(request: NextRequest): string | null {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const cleanHost = host.split(':')[0]
  if (cleanHost.endsWith(`.${ROOT_DOMAIN}`)) return cleanHost.replace(`.${ROOT_DOMAIN}`, '')
  if (cleanHost.endsWith('.localhost')) return cleanHost.replace('.localhost', '')
  return null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  // This route is under /api/auth/ which is in PUBLIC_PATHS so middleware skips it.
  // Extract the subdomain directly from the host header instead.
  const subdomain = request.headers.get('x-subdomain') ?? extractSubdomain(request)

  if (!token || !subdomain) {
    return NextResponse.redirect(`${request.nextUrl.protocol}//${request.headers.get('x-forwarded-host') || request.headers.get('host')}/login?error=invalid_impersonation`)
  }

  // 1. Validate the activation token (single-use, 5-min TTL)
  const { data: session, error } = await adminSupabase
    .from('impersonation_sessions' as any)
    .select('id, business_id, target_user_id, expires_at, used_at')
    .eq('id', token)
    .maybeSingle()

  if (error || !session) {
    return NextResponse.redirect(`${request.nextUrl.protocol}//${request.headers.get('x-forwarded-host') || request.headers.get('host')}/login?error=invalid_impersonation`)
  }

  const s = session as {
    id: string; business_id: string; target_user_id: string
    expires_at: string; used_at: string | null
  }

  if (s.used_at !== null || new Date(s.expires_at) < new Date()) {
    return NextResponse.redirect(`${request.nextUrl.protocol}//${request.headers.get('x-forwarded-host') || request.headers.get('host')}/login?error=impersonation_expired`)
  }

  // Verify the token belongs to the subdomain we're on
  const { data: business } = await adminSupabase
    .from('businesses')
    .select('id, name')
    .eq('id', s.business_id)
    .eq('subdomain', subdomain)
    .maybeSingle()

  if (!business) {
    return NextResponse.redirect(`${request.nextUrl.protocol}//${request.headers.get('x-forwarded-host') || request.headers.get('host')}/login?error=invalid_impersonation`)
  }

  // 2. Mark token as used immediately (single-use enforcement)
  await adminSupabase
    .from('impersonation_sessions' as any)
    .update({ used_at: new Date().toISOString() })
    .eq('id', token)

  // 3. Fetch owner profile for JWT payload
  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('id, role, business_id, branch_id')
    .eq('id', s.target_user_id)
    .single()

  if (!profile) {
    return NextResponse.redirect(`${request.nextUrl.protocol}//${request.headers.get('x-forwarded-host') || request.headers.get('host')}/login?error=invalid_impersonation`)
  }

  // 4. Issue a NEW signed session JWT (separate from the activation token)
  const sessionJwt = await signImpersonationJwt({
    targetUserId: profile.id,
    businessId: profile.business_id,
    role: profile.role,
    branchId: profile.branch_id,
    subdomain,
  })

  // 5. Set the impersonation session cookie SCOPED to this specific subdomain only.
  //    Using domain without a leading dot means it applies only to this subdomain,
  //    not to .repairbooking.co.uk — the superadmin's shared session is untouched.
  const isProd = process.env.NODE_ENV === 'production'
  const cookieDomain = isProd ? `${subdomain}.${ROOT_DOMAIN}` : undefined

  // Build the redirect URL from the original host, not request.url which in dev
  // may be the internal Next.js URL (localhost) rather than the subdomain origin.
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const protocol = isProd ? 'https' : 'http'
  const dashboardUrl = `${protocol}://${host}/dashboard`

  const response = NextResponse.redirect(dashboardUrl)
  response.cookies.set(IMP_COOKIE, sessionJwt, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 3600,
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  })

  // Non-sensitive UI hint cookie (not httpOnly) so the client layout can show
  // the impersonation banner without an extra API round-trip.
  response.cookies.set(IMP_UI_COOKIE, business.name, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 3600,
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  })

  return response
}
