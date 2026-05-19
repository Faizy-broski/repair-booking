'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { confirmToast } from '@/lib/confirm-toast'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Star, RefreshCw, ExternalLink, Copy, CheckCircle2, AlertCircle,
  Search, Filter, ChevronDown, Clock,
  TrendingUp, MessageSquare, ThumbsUp,
  Building2, LogOut, MapPin, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/store/auth.store'
import { formatDate } from '@/lib/utils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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
  place_id:          string | null
  api_key:           string | null
  last_synced:       string | null
  access_token:      string | null
  location_name:     string | null
  location_title:    string | null
  pending_locations: unknown[] | null
}

interface SearchResult {
  place_id:     string
  name:         string
  address:      string
  rating:       number | null
  review_count: number
}

type SortOption  = 'newest' | 'oldest' | 'highest' | 'lowest'
type FilterStar  = 0 | 1 | 2 | 3 | 4 | 5

// ── Small helpers ─────────────────────────────────────────────────────────────

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`${cls} ${i < rating ? 'fill-amber-400 text-amber-400' : 'fill-gray-100 text-gray-200'}`} />
      ))}
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string
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
        <div className="h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-xs text-gray-400">{count}</span>
    </div>
  )
}

// ── Business Search Panel ──────────────────────────────────────────────────────

function BusinessSearchPanel({
  branchId,
  onConnected,
}: {
  branchId: string
  onConnected: () => void
}) {
  const [step, setStep]                   = useState<'form' | 'results'>('form')
  const [name, setName]                   = useState('')
  const [postcode, setPostcode]           = useState('')
  const [searching, setSearching]         = useState(false)
  const [results, setResults]             = useState<SearchResult[]>([])
  const [searchError, setSearchError]     = useState<string | null>(null)
  const [connecting, setConnecting]       = useState<string | null>(null) // place_id being connected

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !postcode.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const res  = await fetch(`/api/google-reviews/search?name=${encodeURIComponent(name.trim())}&postcode=${encodeURIComponent(postcode.trim())}`)
      const json = await res.json()
      if (!res.ok) {
        setSearchError(json.error?.message ?? 'Search failed — check your business name and postcode')
        setSearching(false)
        return
      }
      setResults(json.data ?? [])
      setStep('results')
    } catch {
      setSearchError('Network error — please try again')
    }
    setSearching(false)
  }

  async function handleConnect(result: SearchResult) {
    setConnecting(result.place_id)
    try {
      const res = await fetch(`/api/google-reviews/connect?branch_id=${branchId}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          place_id: result.place_id,
          name:     result.name,
          address:  result.address,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        setSearchError(json.error?.message ?? 'Failed to connect business')
        setConnecting(null)
        return
      }
      onConnected()
    } catch {
      setSearchError('Network error — please try again')
      setConnecting(null)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gray-50 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
          <Building2 className="h-4 w-4 text-amber-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">Find your Google Business listing</h3>
          <p className="text-xs text-gray-500">Search by business name and postcode — no Google login required</p>
        </div>
        {step === 'results' && (
          <button
            onClick={() => { setStep('form'); setResults([]); setSearchError(null) }}
            className="text-xs text-blue-600 hover:underline"
          >
            ← Search again
          </button>
        )}
      </div>

      <div className="p-6 space-y-4">
        {searchError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{searchError}</p>
          </div>
        )}

        {/* Step 1 — Search form */}
        {step === 'form' && (
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Business Name</label>
                <Input
                  placeholder="e.g. Harrely Phone Repairs"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Postcode / City</label>
                <Input
                  placeholder="e.g. SW1A 1AA or London"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button type="submit" loading={searching} className="w-full justify-center gap-2">
              <Search className="h-4 w-4" />
              {searching ? 'Searching…' : 'Search Google Business'}
            </Button>
            <p className="text-center text-xs text-gray-400">
              We search Google Places to find your listing and import reviews automatically
            </p>
          </form>
        )}

        {/* Step 2 — Results list */}
        {step === 'results' && (
          <div className="space-y-3">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 py-10 gap-2">
                <Search className="h-8 w-8 text-gray-300" />
                <p className="text-sm font-medium text-gray-600">No listings found</p>
                <p className="text-xs text-gray-400">Try a different name or postcode</p>
                <button
                  onClick={() => setStep('form')}
                  className="mt-1 text-xs text-blue-600 hover:underline"
                >
                  Search again
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500">{results.length} listing{results.length !== 1 ? 's' : ''} found — pick yours</p>
                <div className="space-y-2">
                  {results.map((r) => (
                    <div
                      key={r.place_id}
                      className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 hover:border-amber-300 hover:bg-amber-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{r.name}</p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{r.address}</span>
                        </div>
                        {r.rating !== null && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <StarRating rating={Math.round(r.rating)} />
                            <span className="text-xs text-gray-400">{r.rating.toFixed(1)} · {r.review_count.toLocaleString()} reviews</span>
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        loading={connecting === r.place_id}
                        disabled={!!connecting}
                        onClick={() => handleConnect(r)}
                        className="shrink-0 gap-1"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        {connecting === r.place_id ? 'Connecting…' : 'Select'}
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Inner page (needs useSearchParams) ────────────────────────────────────────

function GoogleReviewsInner() {
  const { activeBranch } = useAuthStore()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [reviews, setReviews]         = useState<ReviewRow[]>([])
  const [settings, setSettings]       = useState<ReviewSettings | null>(null)
  const [loading, setLoading]         = useState(true)
  const [syncing, setSyncing]         = useState(false)
  const [syncError, setSyncError]     = useState<string | null>(null)
  const [syncSuccess, setSyncSuccess] = useState(false)

  const [search, setSearch]             = useState('')
  const [filterStar, setFilterStar]     = useState<FilterStar>(0)
  const [sort, setSort]                 = useState<SortOption>('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)

  const oauthError = searchParams.get('oauth_error')

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const res  = await fetch(`/api/google-reviews?branch_id=${activeBranch.id}`)
    const json = await res.json()
    const d    = json.data ?? {}
    setReviews(d.data ?? [])
    if (d.settings) setSettings(d.settings)
    setLoading(false)
  }, [activeBranch])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (oauthError) router.replace('/google-reviews')
  }, [oauthError, router])

  // ── Derived state ─────────────────────────────────────────────────────────

  // Search flow (primary) or legacy OAuth connection
  const isConnected = !!(settings?.place_id) || !!(settings?.location_name && settings?.access_token)
  const connectedTitle = settings?.location_title ?? (settings?.location_name ? 'Connected' : null)

  // ── Actions ───────────────────────────────────────────────────────────────

  async function syncReviews() {
    if (!activeBranch) return
    setSyncing(true)
    setSyncError(null)
    setSyncSuccess(false)
    const res  = await fetch(`/api/google-reviews?branch_id=${activeBranch.id}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync' }),
    })
    const json = await res.json()
    if (!res.ok) {
      setSyncError(json.error?.message ?? 'Sync failed')
    } else {
      setSyncSuccess(true)
      setTimeout(() => setSyncSuccess(false), 4000)
      await fetchData()
    }
    setSyncing(false)
  }

  async function disconnect() {
    if (!activeBranch) return
    if (!await confirmToast('Disconnect your Google Business Profile? This will remove all synced reviews.', 'Disconnect')) return
    await fetch(`/api/google-reviews/locations?branch_id=${activeBranch.id}`, { method: 'DELETE' })
    setSettings(null)
    setReviews([])
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const avgRating    = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0
  const avgRatingStr = reviews.length > 0 ? avgRating.toFixed(1) : '—'

  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star, count: reviews.filter((r) => r.rating === star).length,
  }))
  const maxCount = Math.max(...ratingCounts.map((r) => r.count), 1)

  const trendData = (() => {
    const now = new Date()
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
      return {
        month:   d.toLocaleString('default', { month: 'short' }),
        reviews: reviews.filter((r) => {
          const rd = new Date(r.published_at)
          return rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear()
        }).length,
      }
    })
  })()

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
      if (sort === 'newest')  return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      if (sort === 'oldest')  return new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
      if (sort === 'highest') return b.rating - a.rating
      return a.rating - b.rating
    })

  const reviewLink = settings?.place_id
    ? `https://search.google.com/local/writereview?placeid=${settings.place_id}`
    : null

  const SORT_LABELS: Record<SortOption, string> = {
    newest: 'Newest first', oldest: 'Oldest first', highest: 'Highest rated', lowest: 'Lowest rated',
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
              <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Google Reviews</h1>
            {isConnected && (
              <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                {connectedTitle ?? 'Connected'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {reviews.length > 0
              ? `${reviews.length} reviews · ${avgRatingStr} avg rating`
              : 'Connect your Google Business listing to import reviews'}
            {settings?.last_synced && (
              <span className="text-gray-400"> · synced {formatDate(settings.last_synced)}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isConnected && (
            <>
              <button
                onClick={disconnect}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-red-300 hover:text-red-600 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" /> Disconnect
              </button>
              <Button size="sm" onClick={syncReviews} loading={syncing}>
                <RefreshCw className="h-4 w-4" />
                {syncing ? 'Syncing…' : 'Sync Now'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* OAuth error banner */}
      {oauthError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Google connection failed</p>
            <p className="text-red-600">{decodeURIComponent(oauthError)}</p>
          </div>
        </div>
      )}

      {/* Sync feedback */}
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
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Reviews synced successfully!
        </div>
      )}

      {/* ── Not connected — search panel ── */}
      {!isConnected && !loading && (
        <BusinessSearchPanel
          branchId={activeBranch?.id ?? ''}
          onConnected={fetchData}
        />
      )}

      {/* ── Stats ── */}
      {isConnected && reviews.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Average Rating" value={avgRatingStr} sub="out of 5.0"        icon={Star}          color="bg-amber-100 text-amber-600" />
            <StatCard label="Total Reviews"  value={reviews.length} sub="all time"        icon={MessageSquare}  color="bg-blue-100 text-blue-600" />
            <StatCard label="5-Star Reviews" value={ratingCounts[0].count}
              sub={`${reviews.length > 0 ? Math.round((ratingCounts[0].count / reviews.length) * 100) : 0}% of total`}
              icon={ThumbsUp} color="bg-green-100 text-green-600" />
            <StatCard label="This Month" value={trendData[5].reviews} sub="new reviews"   icon={TrendingUp}    color="bg-purple-100 text-purple-600" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-5">
                <p className="text-3xl font-bold text-gray-900">{avgRatingStr}</p>
                <StarRating rating={Math.round(avgRating)} size="lg" />
                <p className="mt-1 text-xs text-gray-400">{reviews.length} total reviews</p>
              </div>
              <div className="space-y-2">
                {ratingCounts.map(({ star, count }) => (
                  <RatingBar key={star} star={star} count={count} max={maxCount} />
                ))}
              </div>
            </div>
            <div className="lg:col-span-3 rounded-xl border border-gray-200 bg-white p-5">
              <p className="mb-4 text-sm font-semibold text-gray-700">Reviews Over Time (6 months)</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} formatter={(v: number) => [v, 'Reviews']} />
                  <Line type="monotone" dataKey="reviews" stroke="#f59e0b" strokeWidth={2.5} dot={{ fill: '#f59e0b', r: 4, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {reviewLink && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 flex items-center gap-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                <ExternalLink className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-blue-900">Customer Review Link</p>
                <p className="text-xs text-blue-700 mt-0.5 truncate">{reviewLink}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => navigator.clipboard.writeText(reviewLink)}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
                <a href={reviewLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Reviews list ── */}
      {isConnected && (
        <div className="space-y-4">
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
                        <button key={o} onClick={() => { setSort(o); setShowSortMenu(false) }}
                          className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors ${sort === o ? 'bg-gray-50 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}>
                          {SORT_LABELS[o]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100" />
              ))}
            </div>
          )}

          {!loading && reviews.length === 0 && isConnected && (
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
              <button onClick={() => { setSearch(''); setFilterStar(0) }} className="text-xs text-blue-600 hover:underline">Clear filters</button>
            </div>
          )}

          {!loading && visibleReviews.map((review) => (
            <div key={review.id} className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all">
              <div className="flex items-start gap-3">
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
                    {settings?.place_id && (
                      <a
                        href={`https://www.google.com/maps/place/?q=place_id:${settings.place_id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  {review.text
                    ? <p className="mt-2.5 text-sm text-gray-700 leading-relaxed">{review.text}</p>
                    : <p className="mt-2.5 text-xs text-gray-400 italic">No written review</p>}
                </div>
              </div>
            </div>
          ))}

          {!loading && visibleReviews.length > 0 && (
            <p className="text-center text-xs text-gray-400 py-2">
              Showing {visibleReviews.length} of {reviews.length} reviews{filterStar > 0 && ` · filtered to ${filterStar}★`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page export — wraps in Suspense for useSearchParams ───────────────────────

export default function GoogleReviewsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-gray-100" />}>
      <GoogleReviewsInner />
    </Suspense>
  )
}
