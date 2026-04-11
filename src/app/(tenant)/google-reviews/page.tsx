'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Star, RefreshCw, ExternalLink, Copy, CheckCircle2, AlertCircle,
  Search, Filter, ChevronDown, Info, Eye, EyeOff, Zap,
  TrendingUp, MessageSquare, ThumbsUp, Clock, ArrowUpRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { formatDate } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewRow {
  id: string
  author_name: string
  rating: number
  text: string | null
  published_at: string
  profile_photo_url?: string | null
}

interface ReviewSettings {
  place_id: string | null
  api_key: string | null
  last_synced: string | null
}

type SortOption = 'newest' | 'oldest' | 'highest' | 'lowest'
type FilterStar = 0 | 1 | 2 | 3 | 4 | 5

// ── Sub-components ────────────────────────────────────────────────────────────

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`${cls} ${i < rating ? 'fill-amber-400 text-amber-400' : 'fill-gray-100 text-gray-200'}`}
        />
      ))}
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-start gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function RatingBar({ star, count, max }: { star: number; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 text-right text-xs font-medium text-gray-600">{star}</span>
      <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-amber-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right text-xs text-gray-400">{count}</span>
    </div>
  )
}

// ── Setup Panel ───────────────────────────────────────────────────────────────

function SetupPanel({
  placeId, apiKey, onPlaceIdChange, onApiKeyChange, onSave, saving, existingConfig,
}: {
  placeId: string; apiKey: string
  onPlaceIdChange: (v: string) => void
  onApiKeyChange: (v: string) => void
  onSave: () => void; saving: boolean
  existingConfig: { place_id: string | null; api_key: string | null }
}) {
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyPlaceId() {
    navigator.clipboard.writeText(placeId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const isConfigured = !!(existingConfig.place_id && existingConfig.api_key)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
          <Zap className="h-4 w-4 text-blue-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Google Places Configuration</h3>
          <p className="text-xs text-gray-500">Connect your Google Business profile to start syncing reviews</p>
        </div>
        {isConfigured && (
          <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Connected
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-6 space-y-5">
        {/* Step 1 — Place ID */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shrink-0">1</span>
            <label className="text-sm font-medium text-gray-800">Google Place ID</label>
          </div>
          <div className="relative">
            <Input
              placeholder="ChIJxxxxxxxxxxxxxxxxxxxxxxxx"
              value={placeId}
              onChange={(e) => onPlaceIdChange(e.target.value)}
              className="pr-10 font-mono text-sm"
            />
            {placeId && (
              <button
                type="button"
                onClick={copyPlaceId}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="Copy Place ID"
              >
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
            )}
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 space-y-1.5">
            <p className="text-xs font-medium text-blue-800">How to find your Place ID:</p>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
              <li>Go to <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer" className="underline font-medium">Google Place ID Finder</a></li>
              <li>Search for your business name and location</li>
              <li>Copy the Place ID shown (starts with "ChIJ")</li>
            </ol>
            <a
              href="https://developers.google.com/maps/documentation/places/web-service/place-id"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium hover:underline mt-1"
            >
              Open Place ID Finder <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Step 2 — API Key */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white shrink-0">2</span>
            <label className="text-sm font-medium text-gray-800">Google Places API Key</label>
          </div>
          <div className="relative">
            <Input
              placeholder="AIzaSy..."
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              className="pr-10 font-mono text-sm"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-3 space-y-1">
            <p className="text-xs font-medium text-amber-800">API Key Requirements:</p>
            <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
              <li>Enable the <strong>Places API</strong> in Google Cloud Console</li>
              <li>Restrict your key to the Places API only for security</li>
              <li>Add your server IP to API key restrictions</li>
            </ul>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-amber-700 font-medium hover:underline mt-1"
            >
              Open Google Cloud Console <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-400">
            {existingConfig.last_synced
              ? `Last synced ${formatDate(existingConfig.last_synced)}`
              : 'Never synced'}
          </p>
          <Button
            onClick={onSave}
            loading={saving}
            disabled={!placeId || !apiKey}
          >
            <CheckCircle2 className="h-4 w-4" /> Save & Connect
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GoogleReviewsPage() {
  const { activeBranch } = useAuthStore()

  const [reviews, setReviews]         = useState<ReviewRow[]>([])
  const [settings, setSettings]       = useState<ReviewSettings>({ place_id: null, api_key: null, last_synced: null })
  const [loading, setLoading]         = useState(true)
  const [syncing, setSyncing]         = useState(false)
  const [showSetup, setShowSetup]     = useState(false)
  const [placeId, setPlaceId]         = useState('')
  const [apiKey, setApiKey]           = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [syncError, setSyncError]     = useState<string | null>(null)
  const [syncSuccess, setSyncSuccess] = useState(false)

  // Filters & sort
  const [search, setSearch]           = useState('')
  const [filterStar, setFilterStar]   = useState<FilterStar>(0)
  const [sort, setSort]               = useState<SortOption>('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)

  // ── Fetch ────────────────────────────────────────────────────────────────

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

  // ── Actions ──────────────────────────────────────────────────────────────

  async function syncReviews() {
    if (!activeBranch) return
    setSyncing(true)
    setSyncError(null)
    setSyncSuccess(false)
    const res = await fetch('/api/google-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: activeBranch.id, action: 'sync' }),
    })
    const json = await res.json()
    if (!res.ok) {
      setSyncError(json.error?.message ?? json.error ?? 'Sync failed. Check your API key and Place ID.')
    } else {
      setSyncSuccess(true)
      setTimeout(() => setSyncSuccess(false), 4000)
      await fetchData()
    }
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
    setShowSetup(false)
    await fetchData()
  }

  // ── Computed values ──────────────────────────────────────────────────────

  const isConfigured = !!(settings.place_id && settings.api_key)
  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length)
    : 0
  const avgRatingStr = reviews.length > 0 ? avgRating.toFixed(1) : '—'

  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }))
  const maxCount = Math.max(...ratingCounts.map((r) => r.count), 1)

  // Monthly trend (last 6 months)
  const trendData = (() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
      const label = d.toLocaleString('default', { month: 'short' })
      const count = reviews.filter((r) => {
        const rd = new Date(r.published_at)
        return rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear()
      }).length
      return { month: label, reviews: count }
    })
  })()

  // Filtered / sorted reviews
  const visibleReviews = reviews
    .filter((r) => {
      if (filterStar > 0 && r.rating !== filterStar) return false
      if (search) {
        const q = search.toLowerCase()
        return r.author_name.toLowerCase().includes(q) || (r.text ?? '').toLowerCase().includes(q)
      }
      return true
    })
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      if (sort === 'oldest') return new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
      if (sort === 'highest') return b.rating - a.rating
      return a.rating - b.rating
    })

  const reviewsText = [
    `Share your experience with us on Google!`,
    `It would mean a lot if you left us a review.`,
  ].join(' ')

  const reviewLink = settings.place_id
    ? `https://search.google.com/local/writereview?placeid=${settings.place_id}`
    : null

  const SORT_LABELS: Record<SortOption, string> = {
    newest: 'Newest first',
    oldest: 'Oldest first',
    highest: 'Highest rated',
    lowest: 'Lowest rated',
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
              <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Google Reviews</h1>
            {isConfigured && (
              <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                Connected
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {reviews.length > 0
              ? `${reviews.length} reviews · ${avgRatingStr} avg rating`
              : 'Sync reviews from your Google Business profile'}
            {settings.last_synced && (
              <span className="text-gray-400"> · synced {formatDate(settings.last_synced)}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSetup((v) => !v)}
          >
            {showSetup ? 'Hide Setup' : (isConfigured ? 'Edit Setup' : 'Setup')}
          </Button>
          {isConfigured && (
            <Button
              size="sm"
              onClick={syncReviews}
              loading={syncing}
            >
              <RefreshCw className="h-4 w-4" />
              {syncing ? 'Syncing…' : 'Sync Now'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Sync feedback ── */}
      {syncError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Sync failed</p>
            <p className="text-red-600">{syncError}</p>
          </div>
          <button onClick={() => setSyncError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {syncSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Reviews synced successfully!
        </div>
      )}

      {/* ── Setup panel ── */}
      {showSetup && (
        <SetupPanel
          placeId={placeId}
          apiKey={apiKey}
          onPlaceIdChange={setPlaceId}
          onApiKeyChange={setApiKey}
          onSave={saveSettings}
          saving={savingSettings}
          existingConfig={settings}
        />
      )}

      {/* ── Not configured CTA ── */}
      {!isConfigured && !showSetup && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-16 gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
            <Star className="h-8 w-8 fill-amber-400 text-amber-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-800">Connect Google Business</p>
            <p className="mt-1 text-sm text-gray-500 max-w-sm">
              Add your Google Place ID and API key to automatically sync customer reviews.
            </p>
          </div>
          <Button onClick={() => setShowSetup(true)}>
            <Zap className="h-4 w-4" /> Get Started
          </Button>
        </div>
      )}

      {/* ── Stats grid ── */}
      {isConfigured && reviews.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Average Rating"
              value={avgRatingStr}
              sub={`out of 5.0`}
              icon={Star}
              color="bg-amber-100 text-amber-600"
            />
            <StatCard
              label="Total Reviews"
              value={reviews.length}
              sub="all time"
              icon={MessageSquare}
              color="bg-blue-100 text-blue-600"
            />
            <StatCard
              label="5-Star Reviews"
              value={ratingCounts[0].count}
              sub={`${reviews.length > 0 ? Math.round((ratingCounts[0].count / reviews.length) * 100) : 0}% of total`}
              icon={ThumbsUp}
              color="bg-green-100 text-green-600"
            />
            <StatCard
              label="This Month"
              value={trendData[5].reviews}
              sub="new reviews"
              icon={TrendingUp}
              color="bg-purple-100 text-purple-600"
            />
          </div>

          {/* ── Charts ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            {/* Rating breakdown */}
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="text-3xl font-bold text-gray-900">{avgRatingStr}</p>
                  <StarRating rating={Math.round(avgRating)} size="lg" />
                  <p className="mt-1 text-xs text-gray-400">{reviews.length} total reviews</p>
                </div>
              </div>
              <div className="space-y-2">
                {ratingCounts.map(({ star, count }) => (
                  <RatingBar key={star} star={star} count={count} max={maxCount} />
                ))}
              </div>
            </div>

            {/* Trend chart */}
            <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-gray-700">Reviews Over Time (6 months)</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}
                    formatter={(v: number) => [v, 'Reviews']}
                  />
                  <Line
                    type="monotone"
                    dataKey="reviews"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={{ fill: '#f59e0b', r: 4, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Review Link Generator ── */}
          {reviewLink && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 flex items-center gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                <ArrowUpRight className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-900">Customer Review Link</p>
                <p className="text-xs text-blue-700 mt-0.5 truncate">{reviewLink}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => { navigator.clipboard.writeText(reviewLink) }}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </button>
                <a
                  href={reviewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Reviews List ── */}
      {isConfigured && (
        <div className="space-y-4">
          {/* Filter / Sort toolbar */}
          {reviews.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search reviews…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="flex items-center gap-2">
                {/* Star filter chips */}
                <div className="flex items-center gap-1">
                  {([0, 5, 4, 3, 2, 1] as FilterStar[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterStar(s === filterStar ? 0 : s)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                        filterStar === s && s > 0
                          ? 'border-amber-400 bg-amber-50 text-amber-700'
                          : filterStar === 0 && s === 0
                            ? 'border-gray-900 bg-gray-900 text-white'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {s === 0 ? 'All' : `${s}★`}
                    </button>
                  ))}
                </div>

                {/* Sort menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowSortMenu((v) => !v)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:border-gray-300 transition-colors"
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {SORT_LABELS[sort]}
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                  {showSortMenu && (
                    <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                      {(Object.keys(SORT_LABELS) as SortOption[]).map((o) => (
                        <button
                          key={o}
                          onClick={() => { setSort(o); setShowSortMenu(false) }}
                          className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors ${
                            sort === o ? 'bg-gray-50 text-gray-900' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {SORT_LABELS[o]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          )}

          {/* Empty states */}
          {!loading && reviews.length === 0 && isConfigured && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 gap-3">
              <Clock className="h-10 w-10 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">No reviews synced yet</p>
              <p className="text-xs text-gray-400">Click "Sync Now" to import your Google reviews</p>
              <Button size="sm" onClick={syncReviews} loading={syncing}>
                <RefreshCw className="h-4 w-4" /> Sync Now
              </Button>
            </div>
          )}

          {!loading && reviews.length > 0 && visibleReviews.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-10 gap-2">
              <Search className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">No reviews match your filter</p>
              <button onClick={() => { setSearch(''); setFilterStar(0) }} className="text-xs text-blue-600 hover:underline">
                Clear filters
              </button>
            </div>
          )}

          {/* Review cards */}
          {!loading && visibleReviews.map((review) => (
            <div
              key={review.id}
              className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all"
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-bold text-white shadow-sm">
                  {review.author_name.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-semibold text-gray-900">{review.author_name}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <StarRating rating={review.rating} />
                        <span className="text-xs text-gray-400">{formatDate(review.published_at)}</span>
                      </div>
                    </div>
                    <a
                      href={`https://www.google.com/maps/place/?q=place_id:${settings.place_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600"
                      title="View on Google Maps"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  {review.text ? (
                    <p className="mt-2.5 text-sm text-gray-700 leading-relaxed">{review.text}</p>
                  ) : (
                    <p className="mt-2.5 text-xs text-gray-400 italic">No written review</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Summary footer */}
          {!loading && visibleReviews.length > 0 && (
            <p className="text-center text-xs text-gray-400 py-2">
              Showing {visibleReviews.length} of {reviews.length} reviews
              {filterStar > 0 && ` · filtered to ${filterStar}★`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
