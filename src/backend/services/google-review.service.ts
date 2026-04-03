import { adminSupabase } from '@/backend/config/supabase'

export const GoogleReviewService = {
  async list(branchId: string) {
    const { data, error } = await adminSupabase
      .from('google_reviews')
      .select('*')
      .eq('branch_id', branchId)
      .order('published_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getSettings(branchId: string) {
    const { data } = await adminSupabase
      .from('google_review_settings')
      .select('place_id, api_key, last_synced')
      .eq('branch_id', branchId)
      .single()
    return data ?? null
  },

  async saveSettings(branchId: string, placeId: string, apiKey: string) {
    const { error } = await adminSupabase
      .from('google_review_settings')
      .upsert(
        { branch_id: branchId, place_id: placeId, api_key: apiKey },
        { onConflict: 'branch_id' }
      )
    if (error) throw error
  },

  async sync(branchId: string) {
    const settings = await this.getSettings(branchId)
    if (!settings?.place_id || !settings?.api_key) {
      throw new Error('Google Places settings not configured')
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${settings.place_id}&fields=reviews&key=${settings.api_key}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch from Google Places API')

    const json = await res.json()
    const reviews: Array<{
      author_name: string
      rating: number
      text: string
      time: number
      review_id?: string
    }> = json.result?.reviews ?? []

    if (reviews.length > 0) {
      const rows = reviews.map((r) => ({
        branch_id: branchId,
        review_id: r.review_id ?? `${branchId}-${r.time}`,
        author_name: r.author_name,
        rating: r.rating,
        text: r.text ?? null,
        published_at: new Date(r.time * 1000).toISOString(),
      }))

      await adminSupabase
        .from('google_reviews')
        .upsert(rows, { onConflict: 'review_id' })
    }

    // Update last_synced
    await adminSupabase
      .from('google_review_settings')
      .update({ last_synced: new Date().toISOString() })
      .eq('branch_id', branchId)
  },
}
