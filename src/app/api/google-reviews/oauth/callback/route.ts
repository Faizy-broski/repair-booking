import { NextRequest, NextResponse } from 'next/server'
import { GoogleOAuthService } from '@/backend/services/google-oauth.service'
import { GoogleReviewService } from '@/backend/services/google-review.service'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'localhost:3000'

function tenantUrl(subdomain: string, path: string, params?: Record<string, string>): string {
  const base = process.env.NODE_ENV === 'production'
    ? `https://${subdomain}.${ROOT_DOMAIN}`
    : `http://${subdomain}.localhost:${new URL(APP_URL).port || '3000'}`
  const url = new URL(path, base)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return url.toString()
}

function errorRedirect(subdomain: string, message: string): NextResponse {
  const dest = subdomain
    ? tenantUrl(subdomain, '/google-reviews', { oauth_error: message })
    : `${APP_URL}/google-reviews?oauth_error=${encodeURIComponent(message)}`
  return NextResponse.redirect(dest)
}

/**
 * Public callback — no withMiddleware (Google redirects here unauthenticated).
 * Exchanges the code for tokens, fetches all GBP locations, persists them, then
 * redirects the user back to their tenant google-reviews page to pick a location.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')

  if (oauthError) {
    return errorRedirect('', `Google OAuth denied: ${oauthError}`)
  }

  if (!code || !state) {
    return errorRedirect('', 'Missing code or state from Google')
  }

  let decoded: ReturnType<typeof GoogleOAuthService.decodeState>
  try {
    decoded = GoogleOAuthService.decodeState(state)
  } catch {
    return errorRedirect('', 'Invalid OAuth state')
  }

  const { branchId, subdomain } = decoded

  // Guard against stale state (> 10 minutes)
  if (Date.now() - decoded.ts > 10 * 60 * 1000) {
    return errorRedirect(subdomain, 'OAuth session expired — please try again')
  }

  try {
    // 1. Exchange auth code for tokens — save immediately so connection isn't lost
    const tokens = await GoogleOAuthService.exchangeCode(code)
    await GoogleReviewService.saveOAuthTokens(branchId, tokens.access_token, tokens.refresh_token, tokens.expires_in, [])

    // 2. Try to list accounts + locations — non-fatal if quota hasn't propagated yet
    try {
      const accounts  = await GoogleOAuthService.listAccounts(tokens.access_token)
      const locations: import('@/backend/services/google-oauth.service').GBPLocation[] = []
      for (const account of accounts) {
        const locs = await GoogleOAuthService.listLocations(tokens.access_token, account.name)
        locations.push(...locs)
      }
      if (locations.length > 0) {
        await GoogleReviewService.saveOAuthTokens(branchId, tokens.access_token, tokens.refresh_token, tokens.expires_in, locations)
      }
    } catch (locErr: unknown) {
      const msg = locErr instanceof Error ? locErr.message : 'location fetch failed'
      console.warn('[GBP OAuth callback] Could not fetch locations (quota/API not yet active):', msg)
      // Tokens are already saved — user can load locations from the page
    }

    // 3. Redirect back regardless — tokens are saved
    const dest = subdomain
      ? tenantUrl(subdomain, '/google-reviews', { oauth_connected: '1' })
      : `${APP_URL}/google-reviews?oauth_connected=1`
    return NextResponse.redirect(dest)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'OAuth callback failed'
    console.error('[GBP OAuth callback]', err)
    return errorRedirect(subdomain, msg)
  }
}
