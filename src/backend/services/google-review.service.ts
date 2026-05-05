import { adminSupabase } from '@/backend/config/supabase'
import { GoogleOAuthService, type GBPLocation } from './google-oauth.service'

/**
 * DB schema additions required (run in Supabase SQL editor):
 *
 * ALTER TABLE google_review_settings
 *   ADD COLUMN IF NOT EXISTS access_token      TEXT,
 *   ADD COLUMN IF NOT EXISTS refresh_token     TEXT,
 *   ADD COLUMN IF NOT EXISTS token_expiry      TIMESTAMPTZ,
 *   ADD COLUMN IF NOT EXISTS account_name      TEXT,
 *   ADD COLUMN IF NOT EXISTS location_name     TEXT,
 *   ADD COLUMN IF NOT EXISTS location_title    TEXT,
 *   ADD COLUMN IF NOT EXISTS pending_locations JSONB;
 */

interface ReviewSettings {
  place_id:          string | null
  api_key:           string | null
  last_synced:       string | null
  access_token:      string | null
  refresh_token:     string | null
  token_expiry:      string | null
  account_name:      string | null
  location_name:     string | null
  location_title:    string | null
  pending_locations: GBPLocation[] | null
}

export const GoogleReviewService = {
  async list(branchId: string) {
    const { data: reviews, error: rErr } = await adminSupabase
      .from('google_reviews')
      .select('*')
      .eq('branch_id', branchId)
      .order('published_at', { ascending: false })
    if (rErr) throw rErr

    const settings = await this.getSettings(branchId)
    return { data: reviews ?? [], settings }
  },

  async getSettings(branchId: string): Promise<ReviewSettings | null> {
    const { data } = await adminSupabase
      .from('google_review_settings')
      .select('place_id, api_key, last_synced, access_token, refresh_token, token_expiry, account_name, location_name, location_title, pending_locations')
      .eq('branch_id', branchId)
      .single()
    return data ?? null
  },

  // ── Legacy manual setup ──────────────────────────────────────────────────

  async saveManualSettings(branchId: string, placeId: string, apiKey: string) {
    const { error } = await adminSupabase
      .from('google_review_settings')
      .upsert(
        { branch_id: branchId, place_id: placeId, api_key: apiKey },
        { onConflict: 'branch_id' }
      )
    if (error) throw error
  },

  // ── OAuth setup ──────────────────────────────────────────────────────────

  async saveOAuthTokens(
    branchId: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    pendingLocations: GBPLocation[]
  ) {
    const expiry = new Date(Date.now() + expiresIn * 1000).toISOString()
    const { error } = await adminSupabase
      .from('google_review_settings')
      .upsert(
        {
          branch_id:         branchId,
          access_token:      accessToken,
          refresh_token:     refreshToken,
          token_expiry:      expiry,
          pending_locations: pendingLocations,
        },
        { onConflict: 'branch_id' }
      )
    if (error) throw error
  },

  async saveSelectedLocation(
    branchId: string,
    locationName: string,
    locationTitle: string,
    placeId: string | undefined
  ) {
    const patch: Record<string, unknown> = {
      branch_id:         branchId,
      location_name:     locationName,
      location_title:    locationTitle,
      pending_locations: null,
    }
    if (placeId) patch.place_id = placeId

    const { error } = await adminSupabase
      .from('google_review_settings')
      .upsert(patch, { onConflict: 'branch_id' })
    if (error) throw error
  },

  async disconnect(branchId: string) {
    const { error } = await adminSupabase
      .from('google_review_settings')
      .update({
        access_token:      null,
        refresh_token:     null,
        token_expiry:      null,
        account_name:      null,
        location_name:     null,
        location_title:    null,
        pending_locations: null,
      })
      .eq('branch_id', branchId)
    if (error) throw error
  },

  // ── Token management ─────────────────────────────────────────────────────

  async getValidAccessToken(branchId: string): Promise<string> {
    const settings = await this.getSettings(branchId)
    if (!settings?.access_token || !settings?.refresh_token) {
      throw new Error('Google account not connected — please connect via OAuth')
    }

    // Refresh if token expires within 5 minutes
    const expiry = settings.token_expiry ? new Date(settings.token_expiry) : new Date(0)
    if (expiry.getTime() - Date.now() < 5 * 60 * 1000) {
      const refreshed = await GoogleOAuthService.refreshAccessToken(settings.refresh_token)
      const newExpiry  = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      await adminSupabase
        .from('google_review_settings')
        .update({ access_token: refreshed.access_token, token_expiry: newExpiry })
        .eq('branch_id', branchId)
      return refreshed.access_token
    }

    return settings.access_token
  },

  // ── Sync ─────────────────────────────────────────────────────────────────

  async sync(branchId: string) {
    const settings = await this.getSettings(branchId)

    if (settings?.location_name && settings?.access_token) {
      return this.syncViaOAuth(branchId, settings.location_name)
    }

    if (settings?.place_id && settings?.api_key) {
      return this.syncViaPlacesApi(branchId, settings.place_id, settings.api_key)
    }

    throw new Error('Not configured — connect your Google Business Profile or enter a Place ID + API key')
  },

  async syncViaOAuth(branchId: string, locationName: string) {
    const accessToken = await this.getValidAccessToken(branchId)
    if (!/^accounts\/[^/]+\/locations\/[^/]+$/.test(locationName)) {
      throw new Error(
        `Invalid location format "${locationName}". Must be accounts/{accountId}/locations/{locationId}. ` +
        `Disconnect and re-enter the correct path.`
      )
    }
    const reviews     = await GoogleOAuthService.fetchReviews(accessToken, locationName)

    if (reviews.length > 0) {
      const rows = reviews.map((r) => ({
        branch_id:   branchId,
        review_id:   r.reviewId,
        author_name: r.reviewer.displayName || 'Anonymous',
        rating:      GoogleOAuthService.starToNumber(r.starRating),
        text:        r.comment ?? null,
        published_at: r.createTime,
        profile_photo_url: r.reviewer.profilePhotoUrl ?? null,
      }))

      const { error } = await adminSupabase
        .from('google_reviews')
        .upsert(rows, { onConflict: 'review_id' })
      if (error) throw error
    }

    await adminSupabase
      .from('google_review_settings')
      .update({ last_synced: new Date().toISOString() })
      .eq('branch_id', branchId)
  },

  async syncViaPlacesApi(branchId: string, placeId: string, apiKey: string) {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews&key=${apiKey}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch from Google Places API')

    const json = await res.json()
    const reviews: Array<{
      author_name: string; rating: number; text: string; time: number; review_id?: string
    }> = json.result?.reviews ?? []

    if (reviews.length > 0) {
      const rows = reviews.map((r) => ({
        branch_id:   branchId,
        review_id:   r.review_id ?? `${branchId}-${r.time}`,
        author_name: r.author_name,
        rating:      r.rating,
        text:        r.text ?? null,
        published_at: new Date(r.time * 1000).toISOString(),
      }))

      await adminSupabase
        .from('google_reviews')
        .upsert(rows, { onConflict: 'review_id' })
    }

    await adminSupabase
      .from('google_review_settings')
      .update({ last_synced: new Date().toISOString() })
      .eq('branch_id', branchId)
  },
}
