'use client'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Star, Settings, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { formatDate } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface ReviewRow {
  id: string
  author_name: string
  rating: number
  text: string | null
  published_at: string
}

interface ReviewSettings {
  place_id: string | null
  api_key: string | null
  last_synced: string | null
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
        />
      ))}
    </div>
  )
}

export default function GoogleReviewsPage() {
  const { activeBranch } = useAuthStore()
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [settings, setSettings] = useState<ReviewSettings>({ place_id: null, api_key: null, last_synced: null })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [placeId, setPlaceId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const res = await fetch(`/api/google-reviews?branch_id=${activeBranch.id}`)
    const json = await res.json()
    setReviews(json.data ?? [])
    if (json.settings) {
      setSettings(json.settings)
      setPlaceId(json.settings.place_id ?? '')
      setApiKey(json.settings.api_key ?? '')
    }
    setLoading(false)
  }, [activeBranch])

  useEffect(() => { fetchData() }, [fetchData])

  async function syncReviews() {
    if (!activeBranch) return
    setSyncing(true)
    await fetch('/api/google-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: activeBranch.id, action: 'sync' }),
    })
    await fetchData()
    setSyncing(false)
  }

  async function saveSettings() {
    if (!activeBranch) return
    setSavingSettings(true)
    await fetch('/api/google-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: activeBranch.id, action: 'save_settings', place_id: placeId, api_key: apiKey }),
    })
    setSavingSettings(false)
    setShowSettings(false)
    fetchData()
  }

  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : '—'

  const ratingDistribution = [5, 4, 3, 2, 1].map((star) => ({
    star: `${star}★`,
    count: reviews.filter((r) => r.rating === star).length,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Google Reviews</h1>
          <p className="text-sm text-gray-500">
            {reviews.length} reviews · avg {avgRating}
            {settings.last_synced && ` · last synced ${formatDate(settings.last_synced)}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
            <Settings className="h-4 w-4" /> Settings
          </Button>
          <Button size="sm" onClick={syncReviews} loading={syncing} disabled={!settings.place_id}>
            <RefreshCw className="h-4 w-4" /> Sync Now
          </Button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h3 className="font-medium text-gray-900">Google Places Settings</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Google Place ID"
              placeholder="ChIJ..."
              value={placeId}
              onChange={(e) => setPlaceId(e.target.value)}
            />
            <Input
              label="Google API Key"
              type="password"
              placeholder="AIza..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button size="sm" onClick={saveSettings} loading={savingSettings}>Save Settings</Button>
          </div>
        </div>
      )}

      {!settings.place_id && !showSettings && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-10">
          <Star className="h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">Configure your Google Place ID to sync reviews</p>
          <Button className="mt-3" size="sm" onClick={() => setShowSettings(true)}>
            <Settings className="h-4 w-4" /> Configure
          </Button>
        </div>
      )}

      {reviews.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {/* Average rating card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
            <p className="text-5xl font-bold text-gray-900">{avgRating}</p>
            <StarRating rating={Math.round(Number(avgRating))} />
            <p className="mt-1 text-sm text-gray-500">{reviews.length} reviews</p>
          </div>

          {/* Rating distribution */}
          <div className="col-span-2 rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-medium text-gray-700">Rating Distribution</h3>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={ratingDistribution} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="star" type="category" tick={{ fontSize: 11 }} width={25} />
                <Tooltip />
                <Bar dataKey="count" fill="#facc15" radius={[0, 4, 4, 0]} name="Reviews" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Reviews list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : reviews.length > 0 ? (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">{review.author_name}</p>
                  <StarRating rating={review.rating} />
                </div>
                <p className="text-xs text-gray-400">{formatDate(review.published_at)}</p>
              </div>
              {review.text && (
                <p className="mt-2 text-sm text-gray-600">{review.text}</p>
              )}
            </div>
          ))}
        </div>
      ) : settings.place_id ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-gray-200 bg-white text-sm text-gray-400">
          No reviews yet. Click "Sync Now" to fetch from Google.
        </div>
      ) : null}
    </div>
  )
}
