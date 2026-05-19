/**
 * Google Business Profile OAuth service.
 * Handles token exchange, refresh, and GBP API calls for reviews.
 *
 * Required APIs to enable in Google Cloud Console → APIs & Services → Library:
 *  1. "My Business Account Management API"   (mybusinessaccountmanagement.googleapis.com) — list accounts
 *  2. "My Business Business Information API" (mybusinessbusinessinformation.googleapis.com) — list locations
 *  3. "My Business Reviews API"              (mybusiness.googleapis.com) — read/write reviews
 *
 * Required OAuth scope: https://www.googleapis.com/auth/business.manage
 *
 * Google split the old v4 mybusiness API into 3 separate APIs in 2022.
 * Accounts + locations now live on their own hosts; only reviews remain on mybusiness v4.
 */

const GOOGLE_AUTH_URL   = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL  = 'https://oauth2.googleapis.com/token'
const GBP_ACCOUNTS_URL  = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const GBP_LOCATIONS_URL = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const GBP_REVIEWS_URL   = 'https://mybusiness.googleapis.com/v4'

const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage'

export interface GBPLocation {
  name: string   // e.g. "accounts/123/locations/456"
  title: string  // display name
  placeId?: string
}

export interface GBPReview {
  reviewId: string
  reviewer: { displayName: string; profilePhotoUrl?: string; isAnonymous?: boolean }
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'
  comment?: string
  createTime: string
}

const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }

export interface OAuthState {
  branchId: string
  subdomain: string
  ts: number
}

export const GoogleOAuthService = {
  clientId() {
    const v = process.env.GOOGLE_CLIENT_ID
    if (!v) throw new Error('GOOGLE_CLIENT_ID env var is not set')
    return v
  },

  clientSecret() {
    const v = process.env.GOOGLE_CLIENT_SECRET
    if (!v) throw new Error('GOOGLE_CLIENT_SECRET env var is not set')
    return v
  },

  redirectUri() {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return `${base}/api/google-reviews/oauth/callback`
  },

  buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id:     this.clientId(),
      redirect_uri:  this.redirectUri(),
      response_type: 'code',
      scope:         GBP_SCOPE,
      access_type:   'offline',
      prompt:        'consent',
      state,
    })
    return `${GOOGLE_AUTH_URL}?${params}`
  },

  encodeState(data: OAuthState): string {
    return Buffer.from(JSON.stringify(data)).toString('base64url')
  },

  decodeState(encoded: string): OAuthState {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  },

  async exchangeCode(code: string): Promise<{
    access_token: string
    refresh_token: string
    expires_in: number
  }> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     this.clientId(),
        client_secret: this.clientSecret(),
        redirect_uri:  this.redirectUri(),
        grant_type:    'authorization_code',
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Google token exchange failed: ${err}`)
    }
    const json = await res.json()
    if (!json.refresh_token) throw new Error('No refresh_token returned — ensure prompt=consent was used')
    return json
  },

  async refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id:     this.clientId(),
        client_secret: this.clientSecret(),
        grant_type:    'refresh_token',
      }),
    })
    if (!res.ok) throw new Error('Google token refresh failed')
    return res.json()
  },

  async listAccounts(accessToken: string): Promise<Array<{ name: string; accountName: string; type: string }>> {
    // My Business Account Management API (v1) — replaced v4/accounts
    const res = await fetch(`${GBP_ACCOUNTS_URL}/accounts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const body = await res.text()
      let message = `HTTP ${res.status}`
      try { message = JSON.parse(body).error?.message || message } catch {}
      throw new Error(`Failed to list Google Business accounts: ${message}`)
    }
    const json = await res.json()
    return json.accounts ?? []
  },

  async listLocations(accessToken: string, accountName: string): Promise<GBPLocation[]> {
    // My Business Business Information API (v1) — replaced v4/{account}/locations
    // readMask is required by this API
    const url = `${GBP_LOCATIONS_URL}/${accountName}/locations?pageSize=100&readMask=name,title,storefrontAddress`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) {
      const body = await res.text()
      let message = `HTTP ${res.status}`
      try { message = JSON.parse(body).error?.message || message } catch {}
      throw new Error(`Failed to list business locations: ${message}`)
    }
    const json = await res.json()
    return (json.locations ?? []).map((loc: {
      name: string
      title?: string
    }) => ({
      name:  loc.name,
      title: loc.title ?? loc.name,
    }))
  },

  async fetchReviews(accessToken: string, locationName: string): Promise<GBPReview[]> {
    // Reviews still use the v4 mybusiness API (My Business Reviews API)
    // locationName = "accounts/{accountId}/locations/{locationId}"
    const all: GBPReview[] = []
    let pageToken = ''

    do {
      const url = `${GBP_REVIEWS_URL}/${locationName}/reviews?pageSize=50${pageToken ? `&pageToken=${pageToken}` : ''}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!res.ok) {
        const body = await res.text()
        let message = `HTTP ${res.status}`
        try { message = JSON.parse(body).error?.message || message } catch {}
        throw new Error(`Failed to fetch Google reviews: ${message}`)
      }
      const json = await res.json()
      all.push(...(json.reviews ?? []))
      pageToken = json.nextPageToken ?? ''
    } while (pageToken)

    return all
  },

  starToNumber(star: string): number {
    return STAR_MAP[star] ?? 0
  },
}
