import { NextRequest, NextResponse } from 'next/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'repairbooking.co.uk'
const SUPERADMIN_SUBDOMAIN = 'admin'
const IMP_COOKIE = 'sb-imp-session'
const IMP_UI_COOKIE = 'sb-imp-ui'

export async function GET(request: NextRequest) {
  const isProd = process.env.NODE_ENV === 'production'
  const adminOrigin = isProd
    ? `https://${SUPERADMIN_SUBDOMAIN}.${ROOT_DOMAIN}`
    : `http://${SUPERADMIN_SUBDOMAIN}.localhost:${request.nextUrl.port || '3000'}`

  const response = NextResponse.redirect(new URL('/superadmin/businesses', adminOrigin))

  // Clear both impersonation cookies
  response.cookies.set(IMP_COOKIE, '', { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 0, path: '/' })
  response.cookies.set(IMP_UI_COOKIE, '', { httpOnly: false, secure: isProd, sameSite: 'lax', maxAge: 0, path: '/' })

  return response
}
