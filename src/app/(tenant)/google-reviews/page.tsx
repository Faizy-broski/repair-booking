'use client'
import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Star, RefreshCw, ExternalLink, Copy, CheckCircle2, AlertCircle,
  Search, Filter, ChevronDown, Info, Eye, EyeOff, Zap,
  TrendingUp, MessageSquare, ThumbsUp, Clock, ArrowUpRight,
  Building2, LogOut, ChevronRight,
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

interface GBPLocation {
  name: string
  title: string
  placeId?: string
}

interface ReviewSettings {
  place_id:          string | null
  api_key:           string | null
  last_synced:       string | null
  access_token:      string | null
  location_name:     string | null
  location_title:    string | null
  pending_locations: GBPLocation[] | null
}

type SortOption  = 'newest' | 'oldest' | 'highest' | 'lowest'
type FilterStar  = 0 | 1 | 2 | 3 | 4 | 5
type SetupMode   = 'none' | 'oauth' | 'manual'

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

// ── Google OAuth Connect Panel ─────────────────────────────────────────────────

function OAuthConnectPanel({
  onConnectClick, connecting, oauthError,
}: {
  onConnectClick: () => void
  connecting: boolean
  oauthError: string | null
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 bg-gray-50 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
          <Building2 className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Connect Google Business Profile</h3>
          <p className="text-xs text-gray-500">Authorise once — we handle everything automatically</p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {oauthError && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{oauthError}</p>
          </div>
        )}

        {/* Steps */}
        <ol className="space-y-3">
          {[
            { step: 1, label: 'Click "Connect with Google" below' },
            { step: 2, label: 'Sign in and grant access to your Business Profile' },
            { step: 3, label: 'Pick which location to sync reviews from' },
            { step: 4, label: 'Done — reviews sync automatically' },
          ].map(({ step, label }) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white mt-0.5">
                {step}
              </span>
              <span className="text-sm text-gray-700">{label}</span>
            </li>
          ))}
        </ol>

        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700">
            We request <strong>read-only</strong> access to your Google Business Profile.
            Your account credentials are never stored — only a secure access token.
          </p>
        </div>

        <Button onClick={onConnectClick} loading={connecting} className="w-full justify-center gap-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {connecting ? 'Redirecting to Google…' : 'Connect with Google'}
        </Button>
      </div>
    </div>
  )
}

// ── Location Picker ────────────────────────────────────────────────────────────

function LocationPicker({
  locations, onSelect, saving,
}: {
  locations: GBPLocation[]
  onSelect: (loc: GBPLocation) => void
  saving: boolean
}) {
  const [selected, setSelected] = useState<GBPLocation | null>(null)

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 shadow-sm overflow-hidden">
      <div className="border-b border-amber-100 bg-amber-50 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
          <Building2 className="h-4 w-4 text-amber-700" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Choose your business location</h3>
          <p className="text-xs text-gray-600">Select the location whose reviews you want to sync</p>
        </div>
      </div>
      <div className="p-6 space-y-3">
        {locations.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-white p-4 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            No locations found on this Google account. Make sure your Business Profile is verified.
          </div>
        ) : (
          <div className="space-y-2">
            {locations.map((loc) => (
              <button
                key={loc.name}
                onClick={() => setSelected(loc)}
                className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                  selected?.name === loc.name
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{loc.title}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{loc.name}</p>
                </div>
                {selected?.name === loc.name && (
                  <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}

        <Button
          onClick={() => selected && onSelect(selected)}
          disabled={!selected || saving}
          loading={saving}
          className="w-full justify-center"
        >
          <ChevronRight className="h-4 w-4" />
          {saving ? 'Connecting…' : 'Use this location'}
        </Button>
      </div>
    </div>
  )
}

// ── Manual Setup Panel ─────────────────────────────────────────────────────────

function ManualSetupPanel({
  placeId, apiKey, onPlaceIdChange, onApiKeyChange, onSave, saving, lastSynced,
}: {
  placeId: string; apiKey: string
  onPlaceIdChange: (v: string) => void; onApiKeyChange: (v: string) => void
  onSave: () => void; saving: boolean; lastSynced: string | null
}) {
  const [showKey, setShowKey] = useState(false)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 bg-gray-50 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-200">
          <Zap className="h-4 w-4 text-gray-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Manual Setup (Advanced)</h3>
          <p className="text-xs text-gray-500">Use a Places API key if you prefer not to use OAuth</p>
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-800">Google Place ID</label>
          <Input placeholder="ChIJxxxxxxxx" value={placeId} onChange={(e) => onPlaceIdChange(e.target.value)} className="font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-800">Places API Key</label>
          <div className="relative">
            <Input
              placeholder="AIzaSy…"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              className="pr-10 font-mono text-sm"
            />
            <button type="button" onClick={() => setShowKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-gray-400">{lastSynced ? `Last synced ${formatDate(lastSynced)}` : 'Never synced'}</p>
          <Button onClick={onSave} loading={saving} disabled={!placeId || !apiKey}>
            <CheckCircle2 className="h-4 w-4" /> Save & Connect
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Token Saved Panel (quota fallback) ───────────────────────────────────────

function TokenSavedPanel({ saving, error, onLoad, onManualSave }: {
  branchId: string
  saving: boolean
  error: string | null
  onLoad: () => void
  onManualSave: (locationName: string, locationTitle: string) => Promise<void>
}) {
  const [showManual, setShowManual]   = useState(false)
  const [locName, setLocName]         = useState('')
  const [locTitle, setLocTitle]       = useState('')

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 shadow-sm overflow-hidden">
      <div className="border-b border-amber-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
          <CheckCircle2 className="h-4 w-4 text-amber-700" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">Google account connected</p>
          <p className="text-xs text-gray-600">Waiting for API access approval to load locations automatically</p>
        </div>
        <Button size="sm" onClick={onLoad} loading={saving} className="shrink-0">
          <RefreshCw className="h-4 w-4" /> Retry
        </Button>
      </div>

      <div className="px-6 py-5 space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">API quota not active yet</p>
              <p className="mt-0.5">Google Business Profile APIs require access approval. Go to Google Cloud Console → My Business Account Management API → Quotas & System Limits → request an increase. Until approved, enter your location details manually below.</p>
            </div>
          </div>
        )}

        <div className="rounded-lg bg-white border border-amber-200 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-700">Manual location entry</p>
          <p className="text-xs text-gray-500">
            Find your location name in <a href="https://business.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">business.google.com</a> → your location URL contains an ID like <code className="bg-gray-100 px-1 rounded">accounts/12345/locations/67890</code>
          </p>
          <button
            onClick={() => setShowManual((v) => !v)}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showManual ? 'rotate-180' : ''}`} />
            {showManual ? 'Hide manual entry' : 'Enter location manually'}
          </button>

          {showManual && (
            <div className="space-y-2 pt-1">
              <Input
                placeholder="Display name (e.g. Harrely Phone Repairs)"
                value={locTitle}
                onChange={(e) => setLocTitle(e.target.value)}
                className="text-sm"
              />
              <Input
                placeholder="accounts/123456789/locations/987654321"
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                className="font-mono text-xs"
              />
              {locName && !/^accounts\/[^/]+\/locations\/[^/]+$/.test(locName.trim()) && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Must be in format: <code className="bg-red-50 px-1 rounded">accounts/123456789/locations/987654321</code>
                </p>
              )}
              <p className="text-xs text-gray-400">
                Find it in your Google Business Profile dashboard URL, e.g.:<br />
                <code className="bg-gray-100 px-1 rounded text-gray-600">business.google.com/.../<strong>locations/10503114178016191880</strong></code><br />
                — you also need your <strong>account ID</strong> from the URL (the number before <code>/locations/</code>).
              </p>
              <Button
                size="sm"
                disabled={!locName.trim() || !locTitle.trim() || saving || !/^accounts\/[^/]+\/locations\/[^/]+$/.test(locName.trim())}
                loading={saving}
                onClick={() => onManualSave(locName.trim(), locTitle.trim())}
              >
                <CheckCircle2 className="h-4 w-4" /> Save Location
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Inner page (needs useSearchParams) ────────────────────────────────────────

function GoogleReviewsInner() {
  const { activeBranch } = useAuthStore()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [reviews, setReviews]               = useState<ReviewRow[]>([])
  const [settings, setSettings]             = useState<ReviewSettings | null>(null)
  const [loading, setLoading]               = useState(true)
  const [syncing, setSyncing]               = useState(false)
  const [syncError, setSyncError]           = useState<string | null>(null)
  const [syncSuccess, setSyncSuccess]       = useState(false)
  const [connecting, setConnecting]         = useState(false)
  const [savingLocation, setSavingLocation] = useState(false)
  const [setupMode, setSetupMode]           = useState<SetupMode>('none')
  const [placeId, setPlaceId]               = useState('')
  const [apiKey, setApiKey]                 = useState('')
  const [savingManual, setSavingManual]     = useState(false)

  const [search, setSearch]           = useState('')
  const [filterStar, setFilterStar]   = useState<FilterStar>(0)
  const [sort, setSort]               = useState<SortOption>('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)

  // Read URL params set by the OAuth callback
  const oauthConnected = searchParams.get('oauth_connected') === '1'
  const oauthError     = searchParams.get('oauth_error')

  const fetchData = useCallback(async () => {
    if (!activeBranch) return
    setLoading(true)
    const res  = await fetch(`/api/google-reviews?branch_id=${activeBranch.id}`)
    const json = await res.json()
    const d    = json.data ?? {}
    setReviews(d.data ?? [])
    if (d.settings) {
      setSettings(d.settings)
      setPlaceId(d.settings.place_id ?? '')
      setApiKey(d.settings.api_key ?? '')
    }
    setLoading(false)
  }, [activeBranch])

  useEffect(() => { fetchData() }, [fetchData])

  // After OAuth redirect, remove query params so they don't linger on refresh
  useEffect(() => {
    if (oauthConnected || oauthError) {
      router.replace('/google-reviews')
    }
  }, [oauthConnected, oauthError, router])

  // ── Derived state ─────────────────────────────────────────────────────────

  const isOAuthConnected    = !!(settings?.location_name && settings?.access_token)
  const isManualConnected   = !!(settings?.place_id && settings?.api_key && !settings?.location_name)
  const isConnected         = isOAuthConnected || isManualConnected
  const hasPendingLocations = (settings?.pending_locations?.length ?? 0) > 0 && !settings?.location_name
  // Tokens saved but location list is empty (quota error during callback)
  const tokensSavedNoLocations = !!(settings?.access_token && !settings?.location_name && !hasPendingLocations)

  // ── Actions ───────────────────────────────────────────────────────────────

  function startOAuth() {
    if (!activeBranch) return
    setConnecting(true)
    window.location.href = `/api/google-reviews/oauth?branch_id=${activeBranch.id}`
  }

  async function selectLocation(loc: GBPLocation) {
    if (!activeBranch) return
    setSavingLocation(true)
    await fetch(`/api/google-reviews/locations?branch_id=${activeBranch.id}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_name:  loc.name,
        location_title: loc.title,
        place_id:       loc.placeId,
      }),
    })
    setSavingLocation(false)
    await fetchData()
  }

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

  async function saveManualSettings() {
    if (!activeBranch) return
    setSavingManual(true)
    await fetch(`/api/google-reviews?branch_id=${activeBranch.id}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_settings', place_id: placeId, api_key: apiKey }),
    })
    setSavingManual(false)
    setSetupMode('none')
    await fetchData()
  }

  async function loadLocations() {
    if (!activeBranch) return
    setSavingLocation(true)
    setSyncError(null)
    const res  = await fetch(`/api/google-reviews/locations/reload?branch_id=${activeBranch.id}`, { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      setSyncError(json.error?.message ?? 'Failed to load locations — API access may not be approved yet')
    } else {
      await fetchData()
    }
    setSavingLocation(false)
  }

  async function disconnect() {
    if (!activeBranch || !confirm('Disconnect your Google Business Profile?')) return
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
                {isOAuthConnected ? settings?.location_title ?? 'Connected' : 'Connected (manual)'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {reviews.length > 0
              ? `${reviews.length} reviews · ${avgRatingStr} avg rating`
              : 'Sync reviews from your Google Business Profile'}
            {settings?.last_synced && (
              <span className="text-gray-400"> · synced {formatDate(settings.last_synced)}</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isConnected ? (
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
          ) : (
            !hasPendingLocations && (
              <Button size="sm" onClick={startOAuth} loading={connecting}>
                <Building2 className="h-4 w-4" /> Connect Google
              </Button>
            )
          )}
        </div>
      </div>

      {/* OAuth redirect error */}
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

      {/* ── Token saved but locations not yet loaded (API quota / access pending) ── */}
      {tokensSavedNoLocations && (
        <TokenSavedPanel
          branchId={activeBranch?.id ?? ''}
          saving={savingLocation}
          error={syncError}
          onLoad={loadLocations}
          onManualSave={async (locationName, locationTitle) => {
            if (!activeBranch) return
            setSavingLocation(true)
            await fetch(`/api/google-reviews/locations?branch_id=${activeBranch.id}`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ location_name: locationName, location_title: locationTitle }),
            })
            setSavingLocation(false)
            setSyncError(null)
            await fetchData()
          }}
        />
      )}

      {/* ── Location picker (after OAuth, before location is chosen) ── */}
      {hasPendingLocations && (
        <LocationPicker
          locations={settings!.pending_locations!}
          onSelect={selectLocation}
          saving={savingLocation}
        />
      )}

      {/* ── Not connected CTA ── */}
      {!isConnected && !hasPendingLocations && setupMode === 'none' && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-16 gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100">
            <Star className="h-8 w-8 fill-amber-400 text-amber-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-gray-800">Connect Google Business Profile</p>
            <p className="mt-1 text-sm text-gray-500 max-w-sm">
              Authorise access with one click and we'll automatically import all your reviews.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => setSetupMode('oauth')} className="gap-2">
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Connect with Google
            </Button>
            <button
              onClick={() => setSetupMode('manual')}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Manual setup
            </button>
          </div>
        </div>
      )}

      {/* ── OAuth connect panel ── */}
      {setupMode === 'oauth' && !isConnected && (
        <OAuthConnectPanel
          onConnectClick={startOAuth}
          connecting={connecting}
          oauthError={oauthError ? decodeURIComponent(oauthError) : null}
        />
      )}

      {/* ── Manual setup panel ── */}
      {setupMode === 'manual' && !isConnected && (
        <div className="space-y-3">
          <ManualSetupPanel
            placeId={placeId}
            apiKey={apiKey}
            onPlaceIdChange={setPlaceId}
            onApiKeyChange={setApiKey}
            onSave={saveManualSettings}
            saving={savingManual}
            lastSynced={settings?.last_synced ?? null}
          />
          <button onClick={() => setSetupMode('oauth')} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" /> Switch to OAuth (recommended)
          </button>
        </div>
      )}

      {/* ── Stats ── */}
      {isConnected && reviews.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Average Rating" value={avgRatingStr} sub="out of 5.0"        icon={Star}         color="bg-amber-100 text-amber-600" />
            <StatCard label="Total Reviews"  value={reviews.length} sub="all time"        icon={MessageSquare} color="bg-blue-100 text-blue-600" />
            <StatCard label="5-Star Reviews" value={ratingCounts[0].count}
              sub={`${reviews.length > 0 ? Math.round((ratingCounts[0].count / reviews.length) * 100) : 0}% of total`}
              icon={ThumbsUp} color="bg-green-100 text-green-600" />
            <StatCard label="This Month" value={trendData[5].reviews} sub="new reviews"   icon={TrendingUp}   color="bg-purple-100 text-purple-600" />
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
                <ArrowUpRight className="h-5 w-5 text-blue-600" />
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
