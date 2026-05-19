import { adminSupabase } from '@/backend/config/supabase'
import { GoogleOAuthService, type GBPLocation } from './google-oauth.service'

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

  // ── Search-based connect (primary flow) ──────────────────────────────────

  async saveSearchedBusiness(branchId: string, placeId: string, name: string, address: string) {
    const { error } = await adminSupabase
      .from('google_review_settings')
      .upsert(
        {
          branch_id:         branchId,
          place_id:          placeId,
          location_title:    name,
          // Clear any old OAuth state so the UI shows the correct connected mode
          access_token:      null,
          refresh_token:     null,
          token_expiry:      null,
          account_name:      null,
          location_name:     null,
          pending_locations: null,
          api_key:           null,
        },
        { onConflict: 'branch_id' }
      )
    if (error) throw error
  },

  // ── Sync dispatcher ───────────────────────────────────────────────────────

  async sync(branchId: string) {
    const settings = await this.getSettings(branchId)

    // OAuth path (legacy — kept for existing connected accounts)
    if (settings?.location_name && settings?.access_token) {
      return this.syncViaOAuth(branchId, settings.location_name)
    }

    // Places API path — Place ID from search
    if (settings?.place_id) {
      const outscraperKey = process.env.OUTSCRAPER_API_KEY
      if (outscraperKey) return this.syncViaOutscraper(branchId, settings.place_id)

      // Use GOOGLE_PLACES_API_KEY from env (preferred) or the legacy per-branch key
      const placesKey = process.env.GOOGLE_PLACES_API_KEY ?? settings.api_key
      if (placesKey) return this.syncViaPlacesApi(branchId, settings.place_id, placesKey)
    }

    throw new Error('Not configured — search for your Google Business listing first')
  },

  // ── Outscraper sync ───────────────────────────────────────────────────────

  async syncViaOutscraper(branchId: string, placeId: string) {
    const apiKey = process.env.OUTSCRAPER_API_KEY
    if (!apiKey) throw new Error('OUTSCRAPER_API_KEY not configured')

    // Start task
    const startRes = await fetch('https://api.outscraper.com/maps/reviews-v3', {
      method:  'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:        [`place_id:${placeId}`],
        reviewsLimit: 200,
        sort:         'newest',
        language:     'en',
      }),
    })

    if (!startRes.ok) {
      const text = await startRes.text()
      throw new Error(`Outscraper request failed (${startRes.status}): ${text}`)
    }

    const startJson = await startRes.json()

    // Some small datasets return synchronously
    if (startJson.status === 'Success' && Array.isArray(startJson.data)) {
      await this.upsertOutscraperReviews(branchId, startJson.data[0] ?? [])
      return
    }

    // Async task — poll until complete (max 60 seconds)
    const taskId = startJson.id
    if (!taskId) throw new Error('No task ID returned from Outscraper')

    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((r) => setTimeout(r, 3000))

      const pollRes  = await fetch(`https://api.outscraper.com/requests/${taskId}`, {
        headers: { 'X-API-KEY': apiKey },
      })
      const pollJson = await pollRes.json()

      if (pollJson.status === 'Success') {
        await this.upsertOutscraperReviews(branchId, pollJson.data?.[0] ?? [])
        return
      }
      if (pollJson.status === 'Failed') {
        throw new Error(`Outscraper task failed: ${pollJson.error ?? 'unknown error'}`)
      }
      // status === 'Pending' — keep polling
    }

    throw new Error('Review sync timed out — Outscraper took longer than expected. Try again in a minute.')
  },

  async upsertOutscraperReviews(branchId: string, reviews: Record<string, unknown>[]) {
    if (!reviews.length) {
      await adminSupabase
        .from('google_review_settings')
        .update({ last_synced: new Date().toISOString() })
        .eq('branch_id', branchId)
      return
    }

    const rows = reviews.map((r) => ({
      branch_id:         branchId,
      review_id:         (r.review_id ?? r.reviewId ?? `${branchId}-${r.date ?? Date.now()}`) as string,
      author_name:       (r.name ?? r.author_name ?? 'Anonymous') as string,
      rating:            (r.rating ?? 0) as number,
      text:              (r.text ?? r.review_text ?? null) as string | null,
      published_at:      (r.date_utc ?? r.date ?? new Date().toISOString()) as string,
      profile_photo_url: (r.author_image ?? r.profile_photo_url ?? null) as string | null,
    }))

    const { error } = await adminSupabase
      .from('google_reviews')
      .upsert(rows, { onConflict: 'review_id' })
    if (error) throw error

    await adminSupabase
      .from('google_review_settings')
      .update({ last_synced: new Date().toISOString() })
      .eq('branch_id', branchId)
  },

  // ── OAuth sync (legacy) ───────────────────────────────────────────────────

  async syncViaOAuth(branchId: string, locationName: string) {
    const accessToken = await this.getValidAccessToken(branchId)
    if (!/^accounts\/[^/]+\/locations\/[^/]+$/.test(locationName)) {
      throw new Error(
        `Invalid location format "${locationName}". Disconnect and reconnect your listing.`
      )
    }
    const reviews = await GoogleOAuthService.fetchReviews(accessToken, locationName)

    if (reviews.length > 0) {
      const rows = reviews.map((r) => ({
        branch_id:         branchId,
        review_id:         r.reviewId,
        author_name:       r.reviewer.displayName || 'Anonymous',
        rating:            GoogleOAuthService.starToNumber(r.starRating),
        text:              r.comment ?? null,
        published_at:      r.createTime,
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

  // ── Legacy Places API (5-review fallback) ────────────────────────────────

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
      await adminSupabase.from('google_reviews').upsert(rows, { onConflict: 'review_id' })
    }

    await adminSupabase
      .from('google_review_settings')
      .update({ last_synced: new Date().toISOString() })
      .eq('branch_id', branchId)
  },

  // ── Token management (OAuth) ──────────────────────────────────────────────

  async getValidAccessToken(branchId: string): Promise<string> {
    const settings = await this.getSettings(branchId)
    if (!settings?.access_token || !settings?.refresh_token) {
      throw new Error('Google account not connected')
    }

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

  // ── OAuth token save (legacy) ─────────────────────────────────────────────

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

  async saveManualSettings(branchId: string, placeId: string, apiKey: string) {
    const { error } = await adminSupabase
      .from('google_review_settings')
      .upsert(
        { branch_id: branchId, place_id: placeId, api_key: apiKey },
        { onConflict: 'branch_id' }
      )
    if (error) throw error
  },

  // ── Disconnect ────────────────────────────────────────────────────────────

  async disconnect(branchId: string) {
    const { error } = await adminSupabase
      .from('google_review_settings')
      .update({
        place_id:          null,
        api_key:           null,
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

    // Also clear cached reviews so the UI shows empty state
    await adminSupabase.from('google_reviews').delete().eq('branch_id', branchId)
  },
}
